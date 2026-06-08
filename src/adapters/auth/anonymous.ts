import type { AuthPort } from "../../ports/auth";

export function createAnonymousAuth(): AuthPort {
  return {
    async authenticate() {
      return { email: null, anonymous: true };
    },
  };
}
