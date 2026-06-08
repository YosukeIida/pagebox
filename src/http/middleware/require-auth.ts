import type { MiddlewareHandler } from "hono";
import type { AuthPort, AuthContext } from "../../ports/auth";
import type { UserRepository } from "../../ports/user-repository";

export function requireAuth(deps: { auth: AuthPort; userRepo: UserRepository }): MiddlewareHandler {
  return async (c, next) => {
    const authUser = await deps.auth.authenticate(c.req.raw);
    if (authUser.anonymous || !authUser.email) {
      // Cloudflare Access のログインページへリダイレクト（ローカル開発では 401）
      const teamDomain = (c.env as Record<string, string> | undefined)?.ACCESS_TEAM_DOMAIN;
      if (teamDomain) {
        const redirectUrl = encodeURIComponent(c.req.url);
        return c.redirect(`https://${teamDomain}/cdn-cgi/access/login?redirect_url=${redirectUrl}`, 302);
      }
      return c.json({ error: "認証が必要です" }, 401);
    }
    const { user, group } = await deps.userRepo.findOrCreateUser(authUser.email);
    const ctx: AuthContext = { userId: user.id, groupId: group.id, email: user.email };
    c.set("authContext", ctx);
    await next();
  };
}
