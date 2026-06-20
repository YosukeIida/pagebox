import { Hono } from "hono";
import type { AppDeps } from "../app";
import type { AuthContext } from "../../ports/auth";
import { requireAuth } from "../middleware/require-auth";
import { Layout } from "../web/layout";
import { StyleguidePage } from "../web/styleguide";

type Vars = { Variables: { authContext: AuthContext } };

export function styleguideRoutes(deps: AppDeps): Hono {
  const app = new Hono<Vars>();

  // requireAdmin は不要。ログインユーザー全員が閲覧できる。
  app.use("/*", requireAuth(deps) as any);

  app.get("/", (c) => {
    const { email } = c.get("authContext");
    const content = StyleguidePage({ email });
    const page = Layout({ title: "pagebox styleguide", children: content });
    return c.html(page as unknown as string);
  });

  return app as unknown as Hono;
}
