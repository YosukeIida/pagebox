import { Hono } from "hono";
import { Resvg, initWasm } from "@resvg/resvg-wasm";
import type { DocumentRepository } from "../../ports/repository";

export interface KVStore {
  get(key: string, type: "arrayBuffer"): Promise<ArrayBuffer | null>;
  put(key: string, value: ArrayBuffer | ArrayBufferView, options?: { expirationTtl?: number }): Promise<void>;
}

export interface OgImageDeps {
  repo: DocumentRepository;
  ogCache: KVStore;
}

const CACHE_TTL = 60 * 60 * 24 * 7; // 7 days
// Pinned URLs — WASM binary and Inter 900 Latin subset font
const WASM_URL = "https://unpkg.com/@resvg/resvg-wasm@2.6.2/index_bg.wasm";
const FONT_URL = "https://cdn.jsdelivr.net/npm/@fontsource/inter@5/files/inter-latin-900-normal.woff2";

type Resources = { fontB64: string };
let resourcesPromise: Promise<Resources> | null = null;

function getResources(): Promise<Resources> {
  if (!resourcesPromise) {
    resourcesPromise = (async (): Promise<Resources> => {
      await initWasm(fetch(WASM_URL));
      const fontRes = await fetch(FONT_URL);
      const fontBuf = await fontRes.arrayBuffer();
      return { fontB64: toBase64(fontBuf) };
    })().catch((e) => {
      resourcesPromise = null;
      throw e;
    });
  }
  return resourcesPromise;
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(binary);
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

function buildSvg(title: string, description: string | null, fontB64: string): string {
  const W = 1200, H = 630, P = 80, LH = 84;
  const lines = wrapTitle(title, 22);
  const titleY = lines.length === 1 ? H / 2 - 10 : H / 2 - 52;
  const titleElems = lines
    .map((l, i) => `<text x="${P}" y="${titleY + i * LH}" font-family="PF" font-size="64" font-weight="900" fill="#1a1a1a">${esc(l)}</text>`)
    .join("\n  ");
  const descY = titleY + lines.length * LH + 28;
  const descElem = description
    ? `<text x="${P}" y="${descY}" font-family="PF" font-size="28" fill="#6b6456">${esc(description.slice(0, 100))}</text>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <style>@font-face{font-family:'PF';src:url('data:font/woff2;base64,${fontB64}');font-weight:900;}</style>
    <pattern id="g" width="20" height="20" patternUnits="userSpaceOnUse">
      <path d="M20 0L0 0 0 20" fill="none" stroke="#888" stroke-width="0.5"/>
    </pattern>
  </defs>
  <rect width="${W}" height="${H}" fill="#f8f6f1"/>
  <rect width="${W}" height="${H}" fill="url(#g)" opacity="0.4"/>
  ${titleElems}
  ${descElem}
  <text x="${W - P}" y="${H - 52}" font-family="PF" font-size="48" font-weight="900" fill="#e07b39" text-anchor="end">pagebox</text>
  <text x="${W - P}" y="${H - 16}" font-family="PF" font-size="20" fill="#6b6456" text-anchor="end">pagebox.iodine2.net</text>
</svg>`;
}

export function ogImageRoute(deps: OgImageDeps): Hono {
  const app = new Hono();

  app.get("/:slug/og.png", async (c) => {
    const slug = c.req.param("slug");

    const cached = await deps.ogCache.get(slug, "arrayBuffer");
    if (cached) {
      return c.newResponse(cached, 200, {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=604800",
      });
    }

    const meta = await deps.repo.findBySlug(slug);
    if (!meta) return c.notFound();

    const { fontB64 } = await getResources();
    const svg = buildSvg(meta.title, meta.description, fontB64);
    const pngBuf = new Resvg(svg, { fitTo: { mode: "width", value: 1200 } }).render().asPng().buffer as ArrayBuffer;

    await deps.ogCache.put(slug, pngBuf, { expirationTtl: CACHE_TTL });

    return c.newResponse(pngBuf, 200, {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=604800",
    });
  });

  return app;
}
