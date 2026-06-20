import { join } from "node:path";
import type { Context } from "hono";
import { renderCss } from "./css";

let cachedJs: string | null = null;

export async function serveStyle(c: Context) {
  const path = join(import.meta.dir, "static/components.css");
  const components = await Bun.file(path).text();
  return c.text(renderCss(components), 200, { "Content-Type": "text/css; charset=utf-8" });
}

export async function serveClientJs(c: Context) {
  if (!cachedJs) {
    const path = join(import.meta.dir, "client.ts");
    const ts = await Bun.file(path).text();
    cachedJs = new Bun.Transpiler({ loader: "ts" }).transformSync(ts);
  }
  return c.text(cachedJs, 200, { "Content-Type": "application/javascript; charset=utf-8" });
}
