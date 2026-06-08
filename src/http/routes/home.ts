import { Hono } from "hono";
import type { AppDeps } from "../app";
import type { AuthContext } from "../../ports/auth";
import { listDocuments } from "../../core/usecases/list-documents";
import { requireAuth } from "../middleware/require-auth";
import { Layout } from "../web/layout";
import { HomePage } from "../web/home";

type Vars = { Variables: { authContext: AuthContext } };

export function homeRoutes(deps: AppDeps): Hono {
  const app = new Hono<Vars>();

  app.get("/", requireAuth(deps) as any, async (c) => {
    const { groupId, email } = c.get("authContext");
    const docs = await listDocuments({ repo: deps.repo }, groupId);
    const content = HomePage({ documents: docs, email });
    const page = Layout({ title: "pagebox", children: content });
    return c.html(page as unknown as string);
  });

  return app as unknown as Hono;
}
