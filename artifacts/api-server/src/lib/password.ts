import {
  randomBytes,
  scrypt,
  timingSafeEqual,
  type ScryptOptions,
} from "node:crypto";
import { promisify } from "node:util";

// promisify loses scrypt's options overload, so state the shape we use.
const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
) => Promise<Buffer>;

// scrypt from node:crypto rather than bcrypt or argon2: it is a real password
// KDF, it is deliberately memory-hard, and it needs no native module, which
// matters on a host that only ships linux-x64 binaries.
//
// N=2^15 with r=8 costs roughly 32MB and about a tenth of a second per hash,
// which is slow enough to make guessing expensive and fast enough to sign in.
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const PARAMS = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

/** "scrypt$N$r$p$salt$hash", so the cost can be raised later without breaking old rows. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const derived = (await scryptAsync(password.normalize("NFKC"), salt, KEY_LENGTH, PARAMS));
  return [
    "scrypt",
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString("base64"),
    derived.toString("base64"),
  ].join("$");
}

/**
 * Always does the same work whether or not the account exists, so timing does
 * not reveal which emails are registered.
 */
export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  const parts = (stored ?? "").split("$");
  const usable = parts.length === 6 && parts[0] === "scrypt";

  const N = usable ? Number(parts[1]) : PARAMS.N;
  const r = usable ? Number(parts[2]) : PARAMS.r;
  const p = usable ? Number(parts[3]) : PARAMS.p;
  const salt = usable ? Buffer.from(parts[4], "base64") : randomBytes(SALT_LENGTH);
  const expected = usable ? Buffer.from(parts[5], "base64") : randomBytes(KEY_LENGTH);

  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return false;

  let derived: Buffer;
  try {
    derived = (await scryptAsync(password.normalize("NFKC"), salt, expected.length, {
      N,
      r,
      p,
      maxmem: PARAMS.maxmem,
    }));
  } catch {
    return false;
  }

  if (derived.length !== expected.length) return false;
  const matches = timingSafeEqual(derived, expected);
  return usable && matches;
}
