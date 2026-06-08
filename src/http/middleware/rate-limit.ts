import type { MiddlewareHandler } from "hono";

interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

export function uploadRateLimit(kv: KVNamespace | undefined, limit = 20): MiddlewareHandler {
  return async (c, next) => {
    if (!kv) return next(); // ローカル開発時はスキップ

    const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
    const hour = Math.floor(Date.now() / 3_600_000);
    const key = `upload:${ip}:${hour}`;

    const raw = await kv.get(key);
    const count = raw ? (JSON.parse(raw) as { count: number }).count : 0;

    if (count >= limit) {
      return c.json(
        { error: "アップロード回数の上限に達しました。1時間後に再試行してください。" },
        429,
      );
    }

    await kv.put(key, JSON.stringify({ count: count + 1 }), { expirationTtl: 3600 });
    return next();
  };
}
