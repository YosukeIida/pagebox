import type { AuthPort, AuthUser } from "../../ports/auth";

interface AccessConfig {
  teamDomain: string;
  audience: string;
}

let cachedJwks: JsonWebKey[] | null = null;
let cacheExpiry = 0;
const CACHE_TTL_MS = 10 * 60 * 1000;

async function fetchJwks(teamDomain: string): Promise<JsonWebKey[]> {
  if (cachedJwks && Date.now() < cacheExpiry) return cachedJwks;
  const res = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`);
  const data = await res.json() as { keys: JsonWebKey[] };
  cachedJwks = data.keys;
  cacheExpiry = Date.now() + CACHE_TTL_MS;
  return cachedJwks;
}

function b64url(s: string): Uint8Array {
  return Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
}

async function verifyJwt(token: string, config: AccessConfig): Promise<string | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, sigB64] = parts;

  let header: { kid?: string; alg?: string };
  let payload: { email?: string; aud?: string | string[]; exp?: number };
  try {
    header = JSON.parse(new TextDecoder().decode(b64url(headerB64)));
    payload = JSON.parse(new TextDecoder().decode(b64url(payloadB64)));
  } catch {
    return null;
  }

  const jwks = await fetchJwks(config.teamDomain);
  const jwk = jwks.find((k: any) => k.kid === header.kid);
  if (!jwk) return null;

  try {
    const key = await crypto.subtle.importKey(
      "jwk", jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false, ["verify"],
    );
    const valid = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5", key,
      b64url(sigB64).buffer as ArrayBuffer,
      new TextEncoder().encode(`${headerB64}.${payloadB64}`).buffer as ArrayBuffer,
    );
    if (!valid) return null;
  } catch {
    return null;
  }

  const aud = payload.aud;
  const audMatch = aud === config.audience || (Array.isArray(aud) && aud.includes(config.audience));
  if (!audMatch) return null;
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;

  return payload.email ?? null;
}

export function createCloudflareAccessAuth(config: AccessConfig): AuthPort {
  return {
    async authenticate(req: Request): Promise<AuthUser> {
      const token = req.headers.get("Cf-Access-Jwt-Assertion");
      if (!token) return { email: null, anonymous: true };
      const email = await verifyJwt(token, config);
      if (!email) return { email: null, anonymous: true };
      return { email, anonymous: false };
    },
  };
}
