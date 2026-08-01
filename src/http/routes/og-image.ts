import { Hono } from "hono";
import { Resvg, initWasm } from "@resvg/resvg-wasm";
// WASM must be statically imported and compiled at build time in CF Workers
// (dynamic instantiation via fetch is disallowed by the embedder)
import resvgWasm from "@resvg/resvg-wasm/index_bg.wasm";
import type { DocumentRepository } from "../../ports/repository";
import type { DocumentVersion } from "../../core/document";
import { colors } from "../../design/tokens";

export interface KVStore {
  get(key: string, type: "arrayBuffer"): Promise<ArrayBuffer | null>;
  put(key: string, value: ArrayBuffer | ArrayBufferView, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface OgImageDeps {
  repo: DocumentRepository;
  ogCache: KVStore;
}

const CACHE_TTL = 60 * 60 * 24 * 7; // 7 days
// Noto Sans JP covers both Latin and CJK — pinned version for reproducibility
const FONT_900_URL = "https://cdn.jsdelivr.net/npm/@fontsource/noto-sans-jp@5.2.8/files/noto-sans-jp-japanese-900-normal.woff2";
const FONT_400_URL = "https://cdn.jsdelivr.net/npm/@fontsource/noto-sans-jp@5.2.8/files/noto-sans-jp-japanese-400-normal.woff2";

type Resources = { fontBuffers: Uint8Array[] };
let resourcesPromise: Promise<Resources> | null = null;

function getResources(): Promise<Resources> {
  if (!resourcesPromise) {
    resourcesPromise = (async (): Promise<Resources> => {
      await initWasm(resvgWasm);
      const [font900Res, font400Res] = await Promise.all([
        fetch(FONT_900_URL),
        fetch(FONT_400_URL),
      ]);
      return {
        fontBuffers: [
          new Uint8Array(await font900Res.arrayBuffer()),
          new Uint8Array(await font400Res.arrayBuffer()),
        ],
      };
    })().catch((e) => {
      resourcesPromise = null;
      throw e;
    });
  }
  return resourcesPromise;
}

// 文字幅の概算（em 単位）: CJK=1.0, スペース=0.3, その他(Latin/数字)=0.55
function charEm(ch: string): number {
  const cp = ch.codePointAt(0) ?? 0;
  if ((cp >= 0x3000 && cp <= 0x9fff) || (cp >= 0xff00 && cp <= 0xffef)) return 1.0;
  if (ch === " ") return 0.3;
  return 0.55;
}

function wrapTitle(text: string, maxWidth: number, fontSize: number): string[] {
  const maxEm = maxWidth / fontSize;

  let em = 0;
  for (const ch of text) em += charEm(ch);
  if (em <= maxEm) return [text];

  // 1行目: maxEm に収まるだけ詰め、Latin はスペースで折り返しを優先
  let line1 = "", em1 = 0;
  for (const ch of text) {
    const ce = charEm(ch);
    if (em1 + ce > maxEm) break;
    line1 += ch;
    em1 += ce;
  }
  const si = line1.lastIndexOf(" ");
  if (si > line1.length * 0.5) line1 = line1.slice(0, si);

  const rest = text.slice(line1.length).trimStart();

  // 2行目: "…" の幅(≈0.6em)を確保しながら詰める
  const ellEm = 0.6;
  let line2 = "", em2 = 0;
  const chars = [...rest];
  for (let i = 0; i < chars.length; i++) {
    const ce = charEm(chars[i]);
    if (em2 + ce + (i < chars.length - 1 ? ellEm : 0) > maxEm) break;
    line2 += chars[i];
    em2 += ce;
  }
  if (line2.length < rest.length) line2 += "…";

  return [line1, line2];
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function buildSvg(title: string): string {
  const W = 1200, H = 630, P = 80, FONT_SIZE = 72, LH = 96;
  const lines = wrapTitle(title, W - P * 2, FONT_SIZE);
  // タイトルを上寄りに配置（1行なら y=280、2行なら y=220 から開始）
  const titleY = lines.length === 1 ? 280 : 220;
  const titleElems = lines
    .map((l, i) => `<text x="${P}" y="${titleY + i * LH}" font-family="Noto Sans JP" font-size="${FONT_SIZE}" font-weight="900" fill="${colors.light.text}">${esc(l)}</text>`)
    .join("\n  ");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <pattern id="g" width="20" height="20" patternUnits="userSpaceOnUse">
      <path d="M20 0L0 0 0 20" fill="none" stroke="#888" stroke-width="0.5"/>
    </pattern>
  </defs>
  <rect width="${W}" height="${H}" fill="${colors.light.surface}"/>
  <rect width="${W}" height="${H}" fill="url(#g)" opacity="0.4"/>
  ${titleElems}
  <text x="${W - P}" y="${H - 52}" font-family="Noto Sans JP" font-size="48" font-weight="900" fill="${colors.light.accent}" text-anchor="end">pagebox</text>
</svg>`;
}

const PNG_HEADERS = {
  "Content-Type": "image/png",
  "Cache-Control": "public, max-age=604800",
};

// 版ごとにタイトルが変わるため、キャッシュキーも版ごとに分ける。
// 削除時の掃除は KV を列挙できないので DELETE /api/documents/:slug 側で行う。
function cacheKey(slug: string, version: number): string {
  return `${slug}:v${version}`;
}

export function ogImageRoute(deps: OgImageDeps): Hono {
  const app = new Hono();

  // requestedVersion 未指定なら最新版のカードを返す。
  // 先に版を解決してからキャッシュを引くので、更新後に古いタイトルの画像が出ることはない。
  async function render(slug: string, requestedVersion?: number): Promise<ArrayBuffer | null> {
    let target: DocumentVersion | null;
    if (requestedVersion === undefined) {
      const meta = await deps.repo.findBySlug(slug);
      if (!meta) return null;
      target = await deps.repo.findVersion(slug, meta.latestVersion);
    } else {
      target = await deps.repo.findVersion(slug, requestedVersion);
    }
    if (!target) return null;

    const key = cacheKey(slug, target.version);
    const cached = await deps.ogCache.get(key, "arrayBuffer");
    if (cached) return cached;

    const { fontBuffers } = await getResources();
    const svg = buildSvg(target.title);
    const pngBuf = new Resvg(svg, {
      fitTo: { mode: "width", value: 1200 },
      font: { fontBuffers, defaultFontFamily: "Noto Sans JP" },
    }).render().asPng().buffer as ArrayBuffer;

    await deps.ogCache.put(key, pngBuf, { expirationTtl: CACHE_TTL });
    return pngBuf;
  }

  app.get("/:slug/og.png", async (c) => {
    const png = await render(c.req.param("slug"));
    return png ? c.newResponse(png, 200, PNG_HEADERS) : c.notFound();
  });

  // 版固定の URL（/d/:slug/v2/og.png）。パターンは "v" + 数字のセグメントのみに限定する。
  app.get("/:slug/:versionSegment{v[0-9]+}/og.png", async (c) => {
    const version = Number(c.req.param("versionSegment").slice(1));
    if (!Number.isSafeInteger(version) || version < 1) return c.notFound();
    const png = await render(c.req.param("slug"), version);
    return png ? c.newResponse(png, 200, PNG_HEADERS) : c.notFound();
  });

  return app;
}
