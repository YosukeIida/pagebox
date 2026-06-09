import { Hono } from "hono";
import { Resvg, initWasm } from "@resvg/resvg-wasm";
import type { DocumentRepository } from "../../ports/repository";

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
const WASM_URL = "https://unpkg.com/@resvg/resvg-wasm@2.6.2/index_bg.wasm";
// Noto Sans JP covers both Latin and CJK — pinned version for reproducibility
const FONT_900_URL = "https://cdn.jsdelivr.net/npm/@fontsource/noto-sans-jp@5.2.8/files/noto-sans-jp-japanese-900-normal.woff2";
const FONT_400_URL = "https://cdn.jsdelivr.net/npm/@fontsource/noto-sans-jp@5.2.8/files/noto-sans-jp-japanese-400-normal.woff2";

type Resources = { fontBuffers: Uint8Array[] };
let resourcesPromise: Promise<Resources> | null = null;

function getResources(): Promise<Resources> {
  if (!resourcesPromise) {
    resourcesPromise = (async (): Promise<Resources> => {
      await initWasm(fetch(WASM_URL));
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

function wrapTitle(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];
  const spaceIdx = text.lastIndexOf(" ", maxChars);
  const cut = spaceIdx > maxChars * 0.5 ? spaceIdx : maxChars;
  const rest = text.slice(cut).trim();
  const second = rest.length > maxChars ? rest.slice(0, maxChars - 1) + "…" : rest;
  return [text.slice(0, cut), second];
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function buildSvg(title: string): string {
  const W = 1200, H = 630, P = 80, FONT_SIZE = 72, LH = 96;
  const lines = wrapTitle(title, 20);
  // タイトルを上寄りに配置（1行なら y=280、2行なら y=220 から開始）
  const titleY = lines.length === 1 ? 280 : 220;
  const titleElems = lines
    .map((l, i) => `<text x="${P}" y="${titleY + i * LH}" font-family="Noto Sans JP" font-size="${FONT_SIZE}" font-weight="900" fill="#1a1a1a">${esc(l)}</text>`)
    .join("\n  ");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <pattern id="g" width="20" height="20" patternUnits="userSpaceOnUse">
      <path d="M20 0L0 0 0 20" fill="none" stroke="#888" stroke-width="0.5"/>
    </pattern>
  </defs>
  <rect width="${W}" height="${H}" fill="#f8f6f1"/>
  <rect width="${W}" height="${H}" fill="url(#g)" opacity="0.4"/>
  ${titleElems}
  <text x="${W - P}" y="${H - 52}" font-family="Noto Sans JP" font-size="48" font-weight="900" fill="#e07b39" text-anchor="end">pagebox</text>
</svg>`;
}

export function ogImageRoute(deps: OgImageDeps): Hono {
  const app = new Hono();

  app.get("/:slug/og.png", async (c) => {
    const slug = c.req.param("slug");

    const cached = await deps.ogCache.get(slug, "arrayBuffer");
    if (cached) {
      // document が削除済みなら KV を掃除して 404
      const exists = await deps.repo.findBySlug(slug);
      if (!exists) {
        await deps.ogCache.delete(slug);
        return c.notFound();
      }
      return c.newResponse(cached, 200, {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=604800",
      });
    }

    const meta = await deps.repo.findBySlug(slug);
    if (!meta) return c.notFound();

    const { fontBuffers } = await getResources();
    const svg = buildSvg(meta.title);
    const pngBuf = new Resvg(svg, {
      fitTo: { mode: "width", value: 1200 },
      font: { fontBuffers, defaultFontFamily: "Noto Sans JP" },
    }).render().asPng().buffer as ArrayBuffer;

    await deps.ogCache.put(slug, pngBuf, { expirationTtl: CACHE_TTL });

    return c.newResponse(pngBuf, 200, {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=604800",
    });
  });

  return app;
}
