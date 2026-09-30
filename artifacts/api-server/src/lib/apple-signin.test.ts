import assert from "node:assert/strict";
import {
  createPrivateKey,
  createSign,
  createVerify,
  generateKeyPairSync,
} from "node:crypto";
import { afterEach, test } from "node:test";
import {
  appleClientSecret,
  appleDisplayName,
  appleFallbackEmail,
  normalizePrivateKey,
  readState,
  signState,
  verifyAppleIdentityToken,
  type AppleConfig,
} from "./apple-signin";

const ec = generateKeyPairSync("ec", { namedCurve: "P-256" });

const config: AppleConfig = {
  servicesId: "com.baketly.web",
  teamId: "TEAM123456",
  keyId: "KEY1234567",
  privateKey: ec.privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  redirectUri: "https://baketly-app.replit.app/api/auth/apple/callback",
};

const decode = (part: string) => JSON.parse(Buffer.from(part, "base64url").toString());

test("the client secret is a JWT Apple will accept, signed with the key", () => {
  const now = Date.UTC(2026, 8, 29, 12, 0, 0);
  const jwt = appleClientSecret(config, now);
  const [header, claims, signature] = jwt.split(".");

  assert.deepEqual(decode(header), { alg: "ES256", kid: "KEY1234567", typ: "JWT" });
  assert.deepEqual(decode(claims), {
    iss: "TEAM123456",
    iat: now / 1000,
    exp: now / 1000 + 300,
    aud: "https://appleid.apple.com",
    sub: "com.baketly.web",
  });

  // ES256 means the raw r||s pair, 64 bytes — a DER-wrapped signature is the
  // classic way this fails, and Apple calls it malformed rather than unsigned.
  assert.equal(Buffer.from(signature, "base64url").length, 64);
  const verifier = createVerify("SHA256");
  verifier.update(`${header}.${claims}`);
  assert.ok(
    verifier.verify(
      { key: ec.publicKey, dsaEncoding: "ieee-p1363" },
      Buffer.from(signature, "base64url"),
    ),
  );
});

// The published app failed here, not at Apple: the .p8 had been flattened onto
// one line by the box it was pasted into, and OpenSSL answered
// "DECODER routines::unsupported" — an error that names nothing useful.
test("a key survives every way a secret box mangles it", () => {
  const pem = ec.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const canonical = normalizePrivateKey(pem);

  const mangled: Record<string, string> = {
    "as it comes out of the file": pem,
    "with the newlines written out": pem.replace(/\n/g, "\\n"),
    "flattened onto one line": pem.replace(/\n/g, ""),
    "with spaces where the breaks were": pem.replace(/\n/g, " "),
    "with Windows line endings": pem.replace(/\n/g, "\r\n"),
    "with the markers but no body breaks": `-----BEGIN PRIVATE KEY-----${pem
      .replace(/-----[A-Z ]+-----/g, "")
      .replace(/\s+/g, "")}-----END PRIVATE KEY-----`,
    "body alone, markers lost": pem.replace(/-----[A-Z ]+-----/g, "").replace(/\s+/g, ""),
    "with a trailing blank line": `${pem}\n\n`,
  };

  for (const [how, value] of Object.entries(mangled)) {
    assert.equal(normalizePrivateKey(value), canonical, how);
    // and the real test: OpenSSL takes it, which is what failed in production
    assert.doesNotThrow(() => createPrivateKey(normalizePrivateKey(value)), how);
  }
});

test("a key that is not PKCS#8 keeps the name it came with", () => {
  const sec1 = generateKeyPairSync("ec", { namedCurve: "P-256" }).privateKey.export({
    type: "sec1",
    format: "pem",
  }) as string;
  const normalized = normalizePrivateKey(sec1.replace(/\n/g, ""));
  assert.match(normalized, /-----BEGIN EC PRIVATE KEY-----/);
  assert.doesNotThrow(() => createPrivateKey(normalized));
});

test("the client secret is signed with a key that arrived flattened", () => {
  const flat = ec.privateKey.export({ type: "pkcs8", format: "pem" }).toString().replace(/\n/g, "");
  const jwt = appleClientSecret({ ...config, privateKey: normalizePrivateKey(flat) });
  const [header, claims, signature] = jwt.split(".");
  const verifier = createVerify("SHA256");
  verifier.update(`${header}.${claims}`);
  assert.ok(
    verifier.verify(
      { key: ec.publicKey, dsaEncoding: "ieee-p1363" },
      Buffer.from(signature, "base64url"),
    ),
  );
});

test("state comes back out of its own signature", () => {
  const signed = signState("native", "a-secret");
  assert.equal(readState(signed, "a-secret"), "native");
});

test("state nobody signed, or someone else signed, is not state", () => {
  const signed = signState("native", "a-secret");
  assert.equal(readState(signed, "another-secret"), null);
  assert.equal(readState("native.nonce.notamac", "a-secret"), null);
  assert.equal(readState("native", "a-secret"), null);
  assert.equal(readState("", "a-secret"), null);
});

test("a tampered payload does not survive the check", () => {
  const signed = signState("web", "a-secret");
  const [, nonce, mac] = signed.split(".");
  assert.equal(readState(`native.${nonce}.${mac}`, "a-secret"), null);
});

test("two states signed the same way are still different values", () => {
  assert.notEqual(signState("web", "a-secret"), signState("web", "a-secret"));
});

// --- identity tokens -------------------------------------------------------

const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = rsa.publicKey.export({ format: "jwk" });

function identityToken(claims: Record<string, unknown>, kid = "test-key"): string {
  const header = Buffer.from(JSON.stringify({ alg: "RS256", kid })).toString("base64url");
  const body = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${body}`);
  return `${header}.${body}.${signer.sign(rsa.privateKey, "base64url")}`;
}

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function appleServesOurKey(kid = "test-key") {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ keys: [{ ...jwk, kid, alg: "RS256", use: "sig" }] }), {
      status: 200,
    })) as typeof fetch;
}

const soon = () => Math.floor(Date.now() / 1000) + 600;

test("a token Apple signed for this app names the baker", async () => {
  appleServesOurKey();
  const identity = await verifyAppleIdentityToken(
    identityToken({
      iss: "https://appleid.apple.com",
      aud: "com.baketly.web",
      exp: soon(),
      sub: "001234.abc",
      email: "Baker@Example.com",
      email_verified: "true",
    }),
    config,
  );
  assert.equal(identity.sub, "001234.abc");
  assert.equal(identity.email, "baker@example.com");
  // Apple sends this as the string as often as the boolean
  assert.equal(identity.emailVerified, true);
});

test("a token minted for another app signs nobody in here", async () => {
  appleServesOurKey();
  await assert.rejects(
    verifyAppleIdentityToken(
      identityToken({
        iss: "https://appleid.apple.com",
        aud: "com.someone.else",
        exp: soon(),
        sub: "001234.abc",
      }),
      config,
    ),
    /another app/,
  );
});

test("a token from somewhere that is not Apple is refused", async () => {
  appleServesOurKey();
  await assert.rejects(
    verifyAppleIdentityToken(
      identityToken({
        iss: "https://appleid.example.com",
        aud: "com.baketly.web",
        exp: soon(),
        sub: "001234.abc",
      }),
      config,
    ),
    /not Apple/,
  );
});

test("an expired token is refused", async () => {
  appleServesOurKey();
  await assert.rejects(
    verifyAppleIdentityToken(
      identityToken({
        iss: "https://appleid.apple.com",
        aud: "com.baketly.web",
        exp: Math.floor(Date.now() / 1000) - 10,
        sub: "001234.abc",
      }),
      config,
    ),
    /expired/,
  );
});

test("a token signed with a key Apple does not publish is refused", async () => {
  // The token names the key Apple really published, so the lookup succeeds and
  // the signature is the only thing standing in the way — signed here with a
  // key of our own making.
  appleServesOurKey();
  const other = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const header = Buffer.from(JSON.stringify({ alg: "RS256", kid: "test-key" })).toString("base64url");
  const body = Buffer.from(
    JSON.stringify({ iss: "https://appleid.apple.com", aud: "com.baketly.web", exp: soon(), sub: "x" }),
  ).toString("base64url");
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${body}`);
  const forged = `${header}.${body}.${signer.sign(other.privateKey, "base64url")}`;

  await assert.rejects(verifyAppleIdentityToken(forged, config), /signature/);
});

test("a token naming a key Apple never published is refused", async () => {
  appleServesOurKey();
  await assert.rejects(
    verifyAppleIdentityToken(
      identityToken({ iss: "https://appleid.apple.com", aud: "com.baketly.web", exp: soon(), sub: "x" }, "made-up"),
      config,
    ),
    /unknown key/,
  );
});

test("garbage is refused before anything is fetched", async () => {
  globalThis.fetch = (async () => {
    throw new Error("should not have asked Apple anything");
  }) as typeof fetch;
  await assert.rejects(verifyAppleIdentityToken("not-a-token", config), /Malformed/);
});

// --- the odds and ends -----------------------------------------------------

test("the name Apple offers once is read out of the form it arrives in", () => {
  assert.equal(appleDisplayName('{"name":{"firstName":"Ada","lastName":"Bakes"}}'), "Ada Bakes");
  assert.equal(appleDisplayName('{"name":{"firstName":"Ada"}}'), "Ada");
  assert.equal(appleDisplayName("{}"), null);
  assert.equal(appleDisplayName("not json"), null);
  assert.equal(appleDisplayName(undefined), null);
});

test("an account with no address still gets one, and the same one each time", () => {
  const first = appleFallbackEmail("001234.abc");
  assert.equal(first, appleFallbackEmail("001234.abc"));
  assert.notEqual(first, appleFallbackEmail("009999.xyz"));
  assert.match(first, /^apple-[0-9a-f]{24}@users\.baketly\.com$/);
});
