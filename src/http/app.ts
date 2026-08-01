import { Hono } from "hono";
import type { StoragePort } from "../ports/storage";
import type { DocumentRepository } from "../ports/repository";
import type { AuthPort } from "../ports/auth";
import type { UserRepository } from "../ports/user-repository";
import type { AnalyticsPort } from "../ports/analytics";
import type { AdminRepository } from "../ports/admin-repository";
import type { Origins } from "../core/urls";
import { serveStyle, serveClientJs } from "./web/assets";
import { homeRoutes } from "./routes/home";
import { apiRoutes } from "./routes/api";
import { docsRoutes } from "./routes/docs";
import { viewerRoutes } from "./routes/viewer";
import { devViewerRoutes } from "./routes/dev-viewer";
import { ogImageRoute } from "./routes/og-image";
import { adminRoutes } from "./routes/admin";
import { styleguideRoutes } from "./routes/styleguide";
import type { KVStore } from "./routes/og-image";

export interface AppDeps {
  storage: StoragePort;
  repo: DocumentRepository;
  auth: AuthPort;
  userRepo: UserRepository;
  // 公開 URL のオリジン。環境（本番 / stage / ローカル）ごとに違うため必ず注入する。
  origins: Origins;
  rateLimiter?: { limit(opts: { key: string }): Promise<{ success: boolean }> };
  ogCache?: KVStore;
  analytics: AnalyticsPort;
  adminEmails: string[];
  adminRepo?: AdminRepository;
  cfApiToken?: string;
  cfAccountId?: string;
  // 開発専用のビューア（/raw/:slug）を有効にする。XSS 隔離を破るため本番では絶対に立てない。
  // container.ts（Bun）だけが PAGEBOX_DEV_VIEWER=1 のときに渡す。
  devViewer?: boolean;
}

export function createApp(deps: AppDeps): Hono {
  const app = new Hono();

  app.get("/static/style.css", serveStyle);
  app.get("/static/app.js", serveClientJs);

  app.route("/", homeRoutes(deps));
  app.route("/api", apiRoutes(deps));
  app.route("/docs", docsRoutes(deps));
  if (deps.ogCache) {
    app.route("/d", ogImageRoute({ repo: deps.repo, ogCache: deps.ogCache }));
  }
  app.route("/d", viewerRoutes(deps));
  if (deps.adminEmails.length > 0) {
    app.route("/admin", adminRoutes(deps));
  }
  app.route("/styleguide", styleguideRoutes(deps));
  if (deps.devViewer) {
    app.route("/raw", devViewerRoutes(deps));
  }

  app.notFound((c) => c.text("Not found", 404));

  return app;
}
