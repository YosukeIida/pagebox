import { Hono } from "hono";
import type { StoragePort } from "../ports/storage";
import type { DocumentRepository } from "../ports/repository";
import type { AuthPort } from "../ports/auth";
import type { UserRepository } from "../ports/user-repository";
import { serveStyle, serveClientJs } from "./web/assets";
import { homeRoutes } from "./routes/home";
import { apiRoutes } from "./routes/api";
import { viewerRoutes } from "./routes/viewer";

export interface AppDeps {
  storage: StoragePort;
  repo: DocumentRepository;
  auth: AuthPort;
  userRepo: UserRepository;
  rateLimiter?: { limit(opts: { key: string }): Promise<{ success: boolean }> };
}

export function createApp(deps: AppDeps): Hono {
  const app = new Hono();

  app.get("/static/style.css", serveStyle);
  app.get("/static/app.js", serveClientJs);

  app.route("/", homeRoutes(deps));
  app.route("/api", apiRoutes(deps));
  app.route("/d", viewerRoutes(deps));

  app.notFound((c) => c.text("Not found", 404));

  return app;
}
