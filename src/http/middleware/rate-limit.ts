import type { MiddlewareHandler } from "hono";

// Cloudflare Workers Rate Limiting API を使用
// KV カウンタより信頼性が高いが、厳密なグローバル一貫性は保証されない点に注意
// 参考: https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/
export interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export function uploadRateLimit(limiter?: RateLimiter): MiddlewareHandler {
  return async (c, next) => {
    if (!limiter) return next(); // ローカル開発時はスキップ（binding 未設定）

    const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
    // pagebox 固有の prefix でキー衝突を防ぐ
    const { success } = await limiter.limit({ key: `pagebox:upload:${ip}` });

    if (!success) {
      return c.json(
        { error: "アップロード回数の上限（5回/分）に達しました。しばらく経ってから再試行してください。" },
        429,
      );
    }

    return next();
  };
}
