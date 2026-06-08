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

interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

interface Env {
  DB: D1Db;
  STORAGE: R2Bkt;
  ASSETS: { fetch(req: Request): Promise<Response> };
  ACCESS_AUD: string;
  ACCESS_TEAM_DOMAIN: string;
  RATE_LIMIT_KV: KVNamespace;
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
      return new Response(r.data.buffer as ArrayBuffer, {
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
    const app = createApp({ storage, repo, auth, userRepo, kvRateLimit: env.RATE_LIMIT_KV });
    return app.fetch(request);
  },
};
