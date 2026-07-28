import { Hono } from "hono";
import type { AppDeps } from "../app";
import { viewUrl } from "../../core/urls";

// /d/:slug → view オリジンの /:slug へリダイレクト（XSS 隔離）
// 実際の HTML 配信は worker.ts の view ホスト処理が担う
export function viewerRoutes(deps: AppDeps): Hono {
  const app = new Hono();

  app.get("/:slug", (c) => {
    return c.redirect(viewUrl(deps.origins, c.req.param("slug")), 301);
  });

  return app;
}
