// Cloudflare Workers entry point
// D1（SQLite）・R2（blob）・Workers Assets（静的ファイル）を binding から組み上げる
import { createD1Repository } from "../adapters/repository/d1";
import type { D1Db } from "../adapters/repository/d1";
import { createD1UserRepository } from "../adapters/repository/d1-user";
import { createR2Storage } from "../adapters/storage/r2";
import type { R2Bkt } from "../adapters/storage/r2";
import { createCloudflareAccessAuth } from "../adapters/auth/cloudflare-access";
import { createApp } from "../http/app";
import { getDocument } from "../core/usecases/get-document";
import type { DocumentMeta } from "../core/document";

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function injectOgpTags(html: string, meta: DocumentMeta): string {
  // 既存の og: / twitter: タグを除去してから Pagebox のタグを先頭に注入
  const stripped = html.replace(
    /<meta[^>]+(?:property="og:[^"]*"|name="twitter:[^"]*")[^>]*\/?>/gi,
    "",
  );
  const ogTags = `<meta property="og:title" content="${escapeAttr(meta.title)}" />
<meta property="og:description" content="${escapeAttr(meta.description ?? "")}" />
<meta property="og:type" content="website" />
<meta property="og:url" content="https://view.pagebox.iodine2.net/${escapeAttr(meta.slug)}" />
<meta name="twitter:card" content="summary" />`;
  if (/<head[^>]*>/i.test(stripped))
    return stripped.replace(/<head[^>]*>/i, (m) => `${m}\n${ogTags}`);
  if (/<\/head>/i.test(stripped))
    return stripped.replace(/<\/head>/i, `${ogTags}\n</head>`);
  return `<head>\n${ogTags}\n</head>\n` + stripped;
}

interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

interface Env {
  DB: D1Db;
  STORAGE: R2Bkt;
  ASSETS: { fetch(req: Request): Promise<Response> };
  ACCESS_AUD: string;
  ACCESS_TEAM_DOMAIN: string;
  RATE_LIMITER: RateLimiter;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

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
      return new Response(injected, {
        headers: { "Content-Type": `${r.meta.contentType}; charset=utf-8` },
      });
    }

    // 静的アセットは Workers Assets にオフロード（Bun.file / Bun.Transpiler 不要）
    if (url.pathname.startsWith("/static/")) {
      return env.ASSETS.fetch(request);
    }

    const repo = createD1Repository(env.DB);
    const userRepo = createD1UserRepository(env.DB);
    const storage = createR2Storage(env.STORAGE);
    const auth = createCloudflareAccessAuth({
      teamDomain: env.ACCESS_TEAM_DOMAIN,
      audience: env.ACCESS_AUD,
    });
    const app = createApp({ storage, repo, auth, userRepo, rateLimiter: env.RATE_LIMITER });
    return app.fetch(request);
  },
};
