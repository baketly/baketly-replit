import { randomBytes } from "node:crypto";
import { json, Router, type IRouter, type Request, type Response } from "express";
import { OAuth2Client } from "google-auth-library";
import { loginSchema, signupSchema } from "@workspace/db";
import { authStore } from "../lib/auth-store";
import { hashPassword, verifyPassword } from "../lib/password";
import { currentUser, endSession, isAdmin, requireUser, startSession } from "../lib/session";

const router: IRouter = Router();

const MAX_ATTEMPTS = 10;
const ATTEMPT_WINDOW_MS = 15 * 60_000;
const attempts = new Map<string, { count: number; resetsAt: number }>();

const OAUTH_STATE_COOKIE = "baketly_oauth_state";

function tooManyAttempts(req: Request, res: Response): boolean {
  const now = Date.now();
  if (attempts.size > 5_000) {
    for (const [key, window] of attempts) if (window.resetsAt <= now) attempts.delete(key);
  }
  const key = req.ip || "unknown";
  const window = attempts.get(key);
  if (!window || window.resetsAt <= now) {
    attempts.set(key, { count: 1, resetsAt: now + ATTEMPT_WINDOW_MS });
    return false;
  }
  if (++window.count > MAX_ATTEMPTS) {
    res.status(429).json({ error: "Too many attempts. Try again in a few minutes." });
    return true;
  }
  return false;
}

const publicUser = (user: { id: string; email: string; displayName: string | null }) => ({
  email: user.email,
  displayName: user.displayName,
  isAdmin: isAdmin(user as never),
});

router.post("/auth/signup", json({ limit: "8kb" }), async (req: Request, res: Response) => {
  try {
    if (tooManyAttempts(req, res)) return;
    const parsed = signupSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "Enter a valid email and a password of at least 8 characters.",
      });
      return;
    }
    const { email, password, displayName } = parsed.data;

    const existing = await authStore.findUserByEmail(email);
    if (existing) {
      // Deliberately the same wording as a wrong password on sign-in, so this
      // endpoint cannot be used to find out who has an account.
      res.status(409).json({ error: "That email is already registered. Try signing in." });
      return;
    }

    const user = await authStore.createUser({
      email,
      displayName: displayName ?? null,
      passwordHash: await hashPassword(password),
    });
    await startSession(res, user.id);
    req.log.info({ userId: user.id }, "Account created");
    res.status(201).json({ user: publicUser(user) });
  } catch (error) {
    req.log.warn({ err: error }, "Signup failed");
    res.status(503).json({ error: "Could not create the account. Try again." });
  }
});

router.post("/auth/login", json({ limit: "8kb" }), async (req: Request, res: Response) => {
  try {
    if (tooManyAttempts(req, res)) return;
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Enter your email and password." });
      return;
    }
    const { email, password } = parsed.data;
    const user = await authStore.findUserByEmail(email);

    // verifyPassword hashes even when there is no user, so a missing account
    // and a wrong password take the same time and give the same message.
    const ok = await verifyPassword(password, user?.passwordHash ?? null);
    if (!user || !ok) {
      res.status(401).json({ error: "That email and password do not match." });
      return;
    }

    await startSession(res, user.id);
    res.json({ user: publicUser(user) });
  } catch (error) {
    req.log.warn({ err: error }, "Login failed");
    res.status(503).json({ error: "Could not sign you in. Try again." });
  }
});

router.post("/auth/logout", async (req: Request, res: Response) => {
  try {
    await endSession(req, res);
    res.json({ ok: true });
  } catch (error) {
    req.log.warn({ err: error }, "Logout failed");
    res.status(503).json({ error: "Could not sign you out. Try again." });
  }
});

router.get("/auth/me", async (req: Request, res: Response) => {
  try {
    const user = await currentUser(req);
    res.json({ user: user ? publicUser(user) : null });
  } catch (error) {
    req.log.warn({ err: error }, "Session check failed");
    res.status(503).json({ error: "Could not check your session." });
  }
});

router.post("/auth/logout-everywhere", requireUser, async (req: Request, res: Response) => {
  await authStore.deleteUserSessions(req.user!.id);
  await endSession(req, res);
  res.json({ ok: true });
});

// ── Google ──────────────────────────────────────────────────────────────
function googleConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) return null;
  return { clientId, clientSecret, redirectUri };
}

router.get("/auth/google/available", (_req: Request, res: Response) => {
  res.json({ available: googleConfig() !== null });
});

router.get("/auth/google", (req: Request, res: Response) => {
  const config = googleConfig();
  if (!config) {
    res.status(503).json({ error: "Google sign-in is not configured yet." });
    return;
  }
  // A random value echoed back by Google and compared on return, so another
  // site cannot start a sign-in that completes in this browser.
  const state = randomBytes(16).toString("base64url");
  res.cookie(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    maxAge: 10 * 60_000,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    signed: true,
    path: "/",
  });
  const client = new OAuth2Client(config.clientId, config.clientSecret, config.redirectUri);
  res.redirect(
    client.generateAuthUrl({
      scope: ["openid", "email", "profile"],
      state,
      prompt: "select_account",
    }),
  );
});

router.get("/auth/google/callback", async (req: Request, res: Response) => {
  const config = googleConfig();
  if (!config) {
    res.status(503).json({ error: "Google sign-in is not configured yet." });
    return;
  }
  try {
    const expectedState = req.signedCookies?.[OAUTH_STATE_COOKIE];
    res.clearCookie(OAUTH_STATE_COOKIE, { path: "/" });
    const state = typeof req.query.state === "string" ? req.query.state : "";
    if (!expectedState || state !== expectedState) {
      res.status(400).send("Sign-in could not be verified. Please try again.");
      return;
    }
    const code = typeof req.query.code === "string" ? req.query.code : "";
    if (!code) {
      res.status(400).send("Google did not return a sign-in code.");
      return;
    }

    const client = new OAuth2Client(config.clientId, config.clientSecret, config.redirectUri);
    const { tokens } = await client.getToken(code);
    if (!tokens.id_token) {
      res.status(502).send("Google did not return an identity token.");
      return;
    }
    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: config.clientId,
    });
    const payload = ticket.getPayload();
    const sub = payload?.sub;
    const email = payload?.email?.trim().toLowerCase();

    // An unverified Google address must not be able to claim an account that
    // was registered with that email and a password.
    if (!sub || !email || payload?.email_verified !== true) {
      res.status(400).send("Google did not confirm a verified email address.");
      return;
    }

    let user = await authStore.findUserByGoogleSub(sub);
    if (!user) {
      const byEmail = await authStore.findUserByEmail(email);
      if (byEmail) {
        await authStore.linkGoogle(byEmail.id, sub);
        user = { ...byEmail, googleSub: sub };
      } else {
        user = await authStore.createUser({
          email,
          displayName: payload?.name ?? null,
          googleSub: sub,
        });
      }
    }

    await startSession(res, user.id);
    req.log.info({ userId: user.id }, "Signed in with Google");
    res.redirect("/");
  } catch (error) {
    req.log.warn({ err: error }, "Google sign-in failed");
    res.status(502).send("Google sign-in failed. Please try again.");
  }
});

export default router;
