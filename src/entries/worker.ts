// Cloudflare Workers entry point
// D1（SQLite）・R2（blob）・Workers Assets（静的ファイル）を binding から組み上げる
import { createD1Repository } from "../adapters/repository/d1";
import type { D1Db } from "../adapters/repository/d1";
import { createD1UserRepository } from "../adapters/repository/d1-user";
import { createR2Storage } from "../adapters/storage/r2";
import type { R2Bkt } from "../adapters/storage/r2";
import { createCloudflareAccessAuth } from "../adapters/auth/cloudflare-access";
import { createApp } from "../http/app";

interface Env {
  DB: D1Db;
  STORAGE: R2Bkt;
  ASSETS: { fetch(req: Request): Promise<Response> };
  ACCESS_AUD: string;
  ACCESS_TEAM_DOMAIN: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

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
    const app = createApp({ storage, repo, auth, userRepo });
    return app.fetch(request);
  },
};
