import { Hono } from "hono";
import type { AppDeps } from "../app";
import { getDocument } from "../../core/usecases/get-document";

// MVP は同一ドメイン raw 配信。将来はサブドメイン隔離で XSS リスクを下げる。
export function viewerRoutes(deps: AppDeps): Hono {
  const app = new Hono();

  app.get("/:slug", async (c) => {
    const slug = c.req.param("slug");
    const r = await getDocument({ storage: deps.storage, repo: deps.repo }, slug);
    if (!r) return c.text("Not found", 404);
    // iframe 埋め込み許可: X-Frame-Options は付けない
    return new Response(r.data.buffer as ArrayBuffer, {
      headers: { "Content-Type": `${r.meta.contentType}; charset=utf-8` },
    });
  });

  return app;
}
