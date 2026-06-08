import type { AuthPort, AuthUser } from "../../ports/auth";

export function createDevAuth(email: string): AuthPort {
  return {
    async authenticate(): Promise<AuthUser> {
      return { email, anonymous: false };
    },
  };
}
