import { Hono } from "hono";
import type { AppDeps } from "../app";
import type { AuthContext } from "../../ports/auth";
import { requireAuth } from "../middleware/require-auth";
import { SharePanel } from "../web/share";

type Vars = { Variables: { authContext: AuthContext } };

// 共有ポップオーバーの中身を HTML fragment として返す。
// markup を components/ に一本化したまま、一覧 SSR での N+1（全ドキュメント × 全版）を避けるため、
// クライアントで DOM を組むのではなくポップオーバーを開いたときにこの fragment を取得する。
export function docsRoutes(deps: AppDeps): Hono {
  const app = new Hono<Vars>();
  app.use("/*", requireAuth(deps));

  app.get("/:slug/share", async (c) => {
    const { groupId } = c.get("authContext");
    const slug = c.req.param("slug");

    const doc = await deps.repo.findBySlug(slug);
    if (!doc || doc.groupId !== groupId) return c.text("Not found", 404);

    const versions = await deps.repo.listVersions(slug);
    const fragment = SharePanel({ doc, versions, origins: deps.origins });
    return c.html(fragment as unknown as string);
  });

  return app as unknown as Hono;
}
