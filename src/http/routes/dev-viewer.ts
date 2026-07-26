import { Hono } from "hono";
import type { AppDeps } from "../app";
import { getDocument } from "../../core/usecases/get-document";
import { renderViewerResponse } from "../viewer-render";

// 開発専用のビューア。
//
// ローカル（Bun）には view.* サブドメインが存在せず、/d/:slug は本番の view ドメインへ
// 301 するだけなので、バージョン別配信をローカルで確認する手段がない。それを埋めるためのルート。
//
// ⚠️ メインドメインでユーザー HTML を配信することは XSS 隔離（view サブドメイン分離）を破る。
//    そのため PAGEBOX_DEV_VIEWER=1 のときだけ container.ts が有効化し、
//    Cloudflare Workers 経路（entries/worker.ts）はこのフラグを一切渡さない。
//    本番で有効化してはいけない。
export function devViewerRoutes(deps: AppDeps): Hono {
  const app = new Hono();

  async function serve(slug: string, version?: number) {
    const r = await getDocument({ storage: deps.storage, repo: deps.repo }, slug, version);
    if (!r) return null;
    return renderViewerResponse(r, deps.origins);
  }

  app.get("/:slug", async (c) => {
    const res = await serve(c.req.param("slug"));
    return res ?? c.text("Not found", 404);
  });

  app.get("/:slug/:versionSegment{v[0-9]+}", async (c) => {
    const version = Number(c.req.param("versionSegment").slice(1));
    if (!Number.isSafeInteger(version) || version < 1) return c.text("Not found", 404);
    const res = await serve(c.req.param("slug"), version);
    return res ?? c.text("Not found", 404);
  });

  return app;
}
