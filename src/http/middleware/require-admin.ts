import type { MiddlewareHandler } from "hono";
import type { AuthContext } from "../../ports/auth";

type Vars = { Variables: { authContext: AuthContext } };

export function requireAdmin(deps: { adminEmails: string[] }): MiddlewareHandler<Vars> {
  return async (c, next) => {
    const ctx = c.get("authContext");
    if (!ctx || !deps.adminEmails.includes(ctx.email)) {
      return c.text("Forbidden", 403);
    }
    await next();
  };
}
