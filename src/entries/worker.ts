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
import type { DocumentMeta } from "../core/document";
import type { KVStore } from "../http/routes/og-image";

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function injectOgpTags(html: string, meta: DocumentMeta): string {
  // 既存の og: / twitter: タグを除去してから Pagebox のタグを先頭に注入
  const stripped = html.replace(
    /<meta[^>]+(?:property=["']og:[^"']*["']|name=["']twitter:[^"']*["'])[^>]*\/?>/gi,
    "",
  );
  const ogTags = `<meta property="og:title" content="${escapeAttr(meta.title)}" />
<meta property="og:description" content="${escapeAttr(meta.description ?? "")}" />
<meta property="og:type" content="website" />
<meta property="og:url" content="https://view.pagebox.iodine2.net/${escapeAttr(meta.slug)}" />
<meta property="og:image" content="https://pagebox.iodine2.net/d/${escapeAttr(meta.slug)}/og.png" />
<meta name="twitter:card" content="summary_large_image" />`;
  if (/<head[^>]*>/i.test(stripped))
    return stripped.replace(/<head[^>]*>/i, (m) => `${m}\n${ogTags}`);
  if (/<\/head>/i.test(stripped))
    return stripped.replace(/<\/head>/i, `${ogTags}\n</head>`);
  return `<head>\n${ogTags}\n</head>\n` + stripped;
}

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
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const startTime = Date.now();

    // view.pagebox.iodine2.net → XSS 隔離済みビューア（認証不要）
    if (url.hostname.startsWith("view.")) {
      if (url.pathname.startsWith("/static/")) {
        return env.ASSETS.fetch(request);
      }
      const slug = url.pathname.slice(1).split("/")[0]; // "/abc123" → "abc123"
      if (!slug) return new Response("Not found", { status: 404 });
      const repo = createD1Repository(env.DB);
      const storage = createR2Storage(env.STORAGE);
      const r = await getDocument({ storage, repo }, slug);
      if (!r) return new Response("Not found", { status: 404 });
      const html = new TextDecoder().decode(r.data);
      const injected = injectOgpTags(html, r.meta);
      const response = new Response(injected, {
        headers: { "Content-Type": `${r.meta.contentType}; charset=utf-8` },
      });
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
      storage, repo, auth, userRepo, adminRepo, analytics, adminEmails,
      rateLimiter: env.RATE_LIMITER,
      ogCache: env.OG_CACHE_KV,
      cfApiToken: env.CLOUDFLARE_API_TOKEN,
      cfAccountId: env.CLOUDFLARE_ACCOUNT_ID,
    });
    return app.fetch(request);
  },
};
