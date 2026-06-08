import { Hono } from "hono";
import type { AppDeps } from "../app";

// /d/:slug → view.pagebox.iodine2.net/:slug へリダイレクト（XSS 隔離）
// 実際の HTML 配信は worker.ts の view サブドメイン処理が担う
export function viewerRoutes(deps: AppDeps): Hono {
  const app = new Hono();

  app.get("/:slug", (c) => {
    const slug = c.req.param("slug");
    return c.redirect(`https://view.pagebox.iodine2.net/${slug}`, 301);
  });

  return app;
}
