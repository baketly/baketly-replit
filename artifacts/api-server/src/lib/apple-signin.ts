// Sign in with Apple.
//
// Apple's flow is Google's with three differences that shape everything here.
//
// There is no client secret to store. Apple issues a private key once, and the
// secret is a short-lived token signed with it on the spot. So the key is the
// thing kept, and the secret is made fresh for each exchange.
//
// Apple answers the callback with a POST, not a redirect with query
// parameters, whenever a name or email is asked for. That means the browser is
// arriving cross-site, where a SameSite=Lax cookie is not sent — so the state
// is signed rather than remembered in a cookie, and verified from the value
// that comes back.
//
// And Apple tells you the person's name exactly once, on the first
// authorisation, in the body of that POST. Ask for it later and it is gone.
//
// Nothing is added to package.json for any of this: Node signs ES256 and
// verifies RS256 on its own, and pulling a JWT library onto a deployment that
// installs from a lockfile is a cost with nothing on the other side of it.

import { createHash, createHmac, createPrivateKey, createPublicKey, createSign, createVerify, randomBytes, timingSafeEqual } from "node:crypto";

export interface AppleConfig {
  servicesId: string;
  teamId: string;
  keyId: string;
  privateKey: string;
  redirectUri: string;
}

/**
 * The five things Apple's portal hands over, or nothing.
 *
 * A PEM pasted into an environment variable loses its line breaks in some
 * hands and keeps them in others, so both spellings are accepted; the key is
 * unusable either way if it arrives half-formed, and that surfaces as a failed
 * sign-in rather than a server that will not start.
 */
export function appleConfig(): AppleConfig | null {
  const servicesId = process.env.APPLE_SERVICES_ID;
  const teamId = process.env.APPLE_TEAM_ID;
  const keyId = process.env.APPLE_KEY_ID;
  const rawKey = process.env.APPLE_PRIVATE_KEY;
  const redirectUri = process.env.APPLE_REDIRECT_URI;
  if (!servicesId || !teamId || !keyId || !rawKey || !redirectUri) return null;
  return {
    servicesId,
    teamId,
    keyId,
    privateKey: rawKey.includes("\\n") ? rawKey.replace(/\\n/g, "\n") : rawKey,
    redirectUri,
  };
}

const base64url = (value: Buffer | string): string =>
  Buffer.from(value).toString("base64url");

/**
 * The client secret Apple expects in place of a password.
 *
 * Six months is Apple's ceiling; this asks for five minutes, because it is
 * made for one token exchange and thrown away.
 */
export function appleClientSecret(config: AppleConfig, now = Date.now()): string {
  const issuedAt = Math.floor(now / 1000);
  const header = base64url(JSON.stringify({ alg: "ES256", kid: config.keyId, typ: "JWT" }));
  const claims = base64url(
    JSON.stringify({
      iss: config.teamId,
      iat: issuedAt,
      exp: issuedAt + 300,
      aud: "https://appleid.apple.com",
      sub: config.servicesId,
    }),
  );
  const signer = createSign("SHA256");
  signer.update(`${header}.${claims}`);
  // ES256 wants the raw r||s pair. Node's default for an EC key is the DER
  // wrapping, which Apple rejects as malformed rather than as unsigned.
  const signature = signer.sign(
    { key: createPrivateKey(config.privateKey), dsaEncoding: "ieee-p1363" },
    "base64url",
  );
  return `${header}.${claims}.${signature}`;
}

/** Where to send the baker to sign in. */
export function appleAuthorizeUrl(config: AppleConfig, state: string): string {
  const query = new URLSearchParams({
    client_id: config.servicesId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: "name email",
    // required once a scope is asked for, and the reason the callback is a POST
    response_mode: "form_post",
    state,
  });
  return `https://appleid.apple.com/auth/authorize?${query}`;
}

/**
 * State that carries its own proof.
 *
 * The browser comes back to a cross-site POST, where a Lax cookie is not sent,
 * so there is nothing on this end to compare against. Signing the value with
 * the session secret means the check needs no memory: a state Baketly did not
 * issue cannot be made to verify.
 */
export function signState(payload: string, secret: string): string {
  const nonce = randomBytes(12).toString("base64url");
  const body = `${payload}.${nonce}`;
  const mac = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${mac}`;
}

/** The payload back out, or null if it was not ours. */
export function readState(state: string, secret: string): string | null {
  const parts = state.split(".");
  if (parts.length !== 3) return null;
  const [payload, nonce, mac] = parts;
  const expected = createHmac("sha256", secret).update(`${payload}.${nonce}`).digest("base64url");
  const given = Buffer.from(mac);
  const want = Buffer.from(expected);
  if (given.length !== want.length || !timingSafeEqual(given, want)) return null;
  return payload;
}

export interface AppleIdentity {
  sub: string;
  email: string | null;
  emailVerified: boolean;
}

interface AppleKey {
  kid: string;
  kty: string;
  n: string;
  e: string;
  alg: string;
}

let cachedKeys: { at: number; keys: AppleKey[] } | null = null;
const KEY_CACHE_MS = 60 * 60_000;

async function appleKeys(): Promise<AppleKey[]> {
  if (cachedKeys && Date.now() - cachedKeys.at < KEY_CACHE_MS) return cachedKeys.keys;
  const response = await fetch("https://appleid.apple.com/auth/keys", {
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`Apple key set unavailable (${response.status})`);
  const payload = (await response.json()) as { keys?: AppleKey[] };
  const keys = payload.keys ?? [];
  if (!keys.length) throw new Error("Apple returned no signing keys");
  cachedKeys = { at: Date.now(), keys };
  return keys;
}

/**
 * Who Apple says this is.
 *
 * The token arrives straight from Apple over TLS, so the signature check is
 * belt and braces — but this is the only thing standing between a string and
 * an account, and the key set is one cached request.
 */
export async function verifyAppleIdentityToken(
  idToken: string,
  config: AppleConfig,
  now = Date.now(),
): Promise<AppleIdentity> {
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new Error("Malformed identity token");
  const [header, body, signature] = parts;

  const { kid } = JSON.parse(Buffer.from(header, "base64url").toString()) as { kid?: string };
  const key = (await appleKeys()).find((candidate) => candidate.kid === kid);
  if (!key) throw new Error("Identity token signed with an unknown key");

  const verifier = createVerify("RSA-SHA256");
  verifier.update(`${header}.${body}`);
  // Node takes a JWK directly; the cast is only because the key came off a
  // parsed JSON body rather than out of a typed key store.
  const publicKey = createPublicKey({ key: key as unknown as never, format: "jwk" });
  if (!verifier.verify(publicKey, Buffer.from(signature, "base64url"))) {
    throw new Error("Identity token signature does not check out");
  }

  const claims = JSON.parse(Buffer.from(body, "base64url").toString()) as {
    iss?: string;
    aud?: string | string[];
    exp?: number;
    sub?: string;
    email?: string;
    email_verified?: boolean | string;
  };

  if (claims.iss !== "https://appleid.apple.com") throw new Error("Identity token is not Apple's");
  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  // A token minted for a different app must not sign anyone in here.
  if (!audience.includes(config.servicesId)) throw new Error("Identity token is for another app");
  if (!claims.exp || claims.exp * 1000 <= now) throw new Error("Identity token has expired");
  if (!claims.sub) throw new Error("Identity token names nobody");

  return {
    sub: claims.sub,
    email: claims.email?.trim().toLowerCase() ?? null,
    // Apple sends this as the string "true" as often as the boolean.
    emailVerified: claims.email_verified === true || claims.email_verified === "true",
  };
}

/** Trade the code for the identity token. */
export async function exchangeAppleCode(code: string, config: AppleConfig): Promise<string> {
  const response = await fetch("https://appleid.apple.com/auth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.servicesId,
      client_secret: appleClientSecret(config),
      code,
      grant_type: "authorization_code",
      redirect_uri: config.redirectUri,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    id_token?: string;
    error?: string;
  };
  if (!response.ok || !payload.id_token) {
    throw new Error(`Apple refused the code exchange: ${payload.error || response.status}`);
  }
  return payload.id_token;
}

/**
 * A name for an account whose email is hidden.
 *
 * With Hide My Email there is nothing human in the address, and Apple only
 * offers the real name on the first authorisation. When it is there it is
 * used; when it is not, the account is still perfectly usable without one.
 */
export function appleDisplayName(rawUser: unknown): string | null {
  if (typeof rawUser !== "string" || !rawUser) return null;
  try {
    const parsed = JSON.parse(rawUser) as { name?: { firstName?: string; lastName?: string } };
    const name = [parsed.name?.firstName, parsed.name?.lastName].filter(Boolean).join(" ").trim();
    return name || null;
  } catch {
    return null;
  }
}

/** A stand-in address for a sub with no email, stable for that person. */
export function appleFallbackEmail(sub: string): string {
  return `apple-${createHash("sha256").update(sub).digest("hex").slice(0, 24)}@users.baketly.com`;
}
