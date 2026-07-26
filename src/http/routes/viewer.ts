import { Hono } from "hono";
import type { AppDeps } from "../app";
import { viewUrl } from "../../core/urls";

// /d/:slug    → view オリジンの /:slug（最新版）へリダイレクト（XSS 隔離）
// /d/:slug/v2 → view オリジンの /:slug/v2（版固定）へリダイレクト
// 実際の HTML 配信は worker.ts の view ホスト処理が担う。
// 注意: /d/:slug/og.png は app.ts でこれより先に登録される og-image ルートが処理する。
export function viewerRoutes(deps: AppDeps): Hono {
  const app = new Hono();

  app.get("/:slug", (c) => {
    return c.redirect(viewUrl(deps.origins, c.req.param("slug")), 301);
  });

  app.get("/:slug/:versionSegment{v[0-9]+}", (c) => {
    const version = Number(c.req.param("versionSegment").slice(1));
    if (!Number.isSafeInteger(version) || version < 1) return c.notFound();
    return c.redirect(viewUrl(deps.origins, c.req.param("slug"), version), 301);
  });

  return app;
}
