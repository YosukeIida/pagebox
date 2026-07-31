// Cloudflare Workers entry point
// D1（SQLite）・R2（blob）・Workers Assets（静的ファイル）を binding から組み上げる
import { createD1Repository } from "../adapters/repository/d1";
import type { D1Db } from "../adapters/repository/d1";
import { createD1UserRepository } from "../adapters/repository/d1-user";
import { createD1AdminRepository } from "../adapters/repository/d1-admin";
import { createR2Storage } from "../adapters/storage/r2";
import type { R2Bkt } from "../adapters/storage/r2";
import { createCloudflareAccessAuth } from "../adapters/auth/cloudflare-access";
import { createCloudflareAnalytics } from "../adapters/analytics/cloudflare";
import { createApp } from "../http/app";
import { getDocument } from "../core/usecases/get-document";
// OGP タグ注入とレスポンス組み立ては http/viewer-render.ts に集約している
// （dev-viewer と共有するため）
import { parseViewPath, viewHostname } from "../core/urls";
import { renderViewerResponse } from "../http/viewer-render";
import type { KVStore } from "../http/routes/og-image";


interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

interface AnalyticsDataset {
  writeDataPoint(data: { blobs?: string[]; doubles?: number[]; indexes?: string[] }): void;
}

interface Env {
  DB: D1Db;
  STORAGE: R2Bkt;
  ASSETS: { fetch(req: Request): Promise<Response> };
  ACCESS_AUD: string;
  ACCESS_TEAM_DOMAIN: string;
  RATE_LIMITER: RateLimiter;
  OG_CACHE_KV: KVStore;
  ANALYTICS: AnalyticsDataset;
  ADMIN_EMAILS: string;
  CLOUDFLARE_API_TOKEN: string;
  CLOUDFLARE_ACCOUNT_ID: string;
  // 環境ごとの公開オリジン（本番 / stage で違う）
  APP_ORIGIN: string;
  VIEW_ORIGIN: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const startTime = Date.now();
    const origins = { app: env.APP_ORIGIN, view: env.VIEW_ORIGIN };

    // view オリジン（XSS 隔離済みビューア・認証不要）。
    // ホスト名の完全一致で判定する。prefix 判定（startsWith("view.")）だと
    // view.stage.… のような別環境のホストまで拾ってしまい壊れやすい。
    if (url.hostname === viewHostname(origins)) {
      if (url.pathname.startsWith("/static/")) {
        return env.ASSETS.fetch(request);
      }
      // "/abc123" → 最新版、"/abc123/v2" → v2 固定
      const parsed = parseViewPath(url.pathname);
      if (!parsed) return new Response("Not found", { status: 404 });
      const { slug, version } = parsed;
      const repo = createD1Repository(env.DB);
      const storage = createR2Storage(env.STORAGE);
      const r = await getDocument({ storage, repo }, slug, version);
      if (!r) return new Response("Not found", { status: 404 });
      const response = renderViewerResponse(r, origins, version);
      // Analytics Engine に閲覧イベントを記録（fire-and-forget）
      if (env.ANALYTICS) {
        const analytics = createCloudflareAnalytics(env.ANALYTICS);
        const refererHost = (() => {
          try { return new URL(request.headers.get("referer") ?? "").hostname; } catch { return ""; }
        })();
        analytics.recordView(slug, {
          country: (request as any).cf?.country as string | undefined,
          referer: refererHost || undefined,
          responseTimeMs: Date.now() - startTime,
        });
      }
      return response;
    }

    // 静的アセットは Workers Assets にオフロード（Bun.file / Bun.Transpiler 不要）
    if (url.pathname.startsWith("/static/")) {
      return env.ASSETS.fetch(request);
    }

    const repo = createD1Repository(env.DB);
    const userRepo = createD1UserRepository(env.DB);
    const adminRepo = createD1AdminRepository(env.DB);
    const storage = createR2Storage(env.STORAGE);
    const auth = createCloudflareAccessAuth({
      teamDomain: env.ACCESS_TEAM_DOMAIN,
      audience: env.ACCESS_AUD,
    });
    const analytics = env.ANALYTICS
      ? createCloudflareAnalytics(env.ANALYTICS)
      : { recordView() {}, recordUpload() {} };
    const adminEmails = env.ADMIN_EMAILS?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
    const app = createApp({
      storage, repo, auth, userRepo, adminRepo, analytics, adminEmails, origins,
      rateLimiter: env.RATE_LIMITER,
      ogCache: env.OG_CACHE_KV,
      cfApiToken: env.CLOUDFLARE_API_TOKEN,
      cfAccountId: env.CLOUDFLARE_ACCOUNT_ID,
    });
    return app.fetch(request);
  },
};
