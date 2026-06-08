import { Hono } from "hono";
import type { StoragePort } from "../ports/storage";
import type { DocumentRepository } from "../ports/repository";
import type { AuthPort } from "../ports/auth";
import type { UserRepository } from "../ports/user-repository";
import { serveStyle, serveClientJs } from "./web/assets";
import { homeRoutes } from "./routes/home";
import { apiRoutes } from "./routes/api";
import { viewerRoutes } from "./routes/viewer";

export interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

export interface AppDeps {
  storage: StoragePort;
  repo: DocumentRepository;
  auth: AuthPort;
  userRepo: UserRepository;
  kvRateLimit?: KVNamespace;
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
