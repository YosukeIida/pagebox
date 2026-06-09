import type { MiddlewareHandler } from "hono";

// Cloudflare Workers Rate Limiting API
// 原子性・スライディングウィンドウを組み込みで保証する
export interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export function uploadRateLimit(limiter?: RateLimiter): MiddlewareHandler {
  return async (c, next) => {
    if (!limiter) return next(); // ローカル開発時はスキップ（binding 未設定）

    const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
    const { success } = await limiter.limit({ key: ip });

    if (!success) {
      return c.json(
        { error: "アップロード回数の上限に達しました。しばらく経ってから再試行してください。" },
        429,
      );
    }

    return next();
  };
}
