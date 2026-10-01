import { useEffect, useState } from "react";
import { apiBase, apiFetch, rememberSession } from "./api";
import { canUseNativeSignIn, startNativeSignIn } from "./native-auth";
import { PRIVACY_SECTIONS, PRIVACY_UPDATED, policyContact } from "@workspace/policy";

// The sign-in screen is a real React component rendered over the app, not part
// of the generated template. The template is one large string patched by exact
// string matches; a form that guards every account is not something to hang off
// that. It also means the app underneath needs no knowledge of accounts.

export type SignedInUser = { email: string; displayName: string | null; isAdmin: boolean };

type Mode = "signin" | "signup";

async function post(path: string, body?: unknown): Promise<Response> {
  return apiFetch(path, {
    method: "POST",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
}

export async function fetchCurrentUser(): Promise<SignedInUser | null> {
  try {
    const response = await apiFetch("/api/auth/me");
    if (!response.ok) return null;
    const payload = (await response.json()) as { user?: SignedInUser | null };
    return payload.user ?? null;
  } catch {
    return null;
  }
}

export async function signOut(): Promise<void> {
  await post("/api/auth/logout").catch(() => undefined);
  // the app keeps its own copy of the session; signing out has to drop it too
  rememberSession(null);
  // A full reload is deliberate: it clears every trace of the previous baker's
  // workspace from memory rather than trying to unpick it.
  window.location.reload();
}

const shell: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 2147483000,
  background: "var(--color-bg, #f7f4ec)",
  display: "flex",
  // Not align-items:center, which is what cut the top off the privacy policy.
  //
  // Centring a flex child taller than its scrolling parent puts the top of it
  // above the parent's scrollable area, where nothing can reach it: the policy
  // opened part way down its own first page and would not scroll up to the
  // heading or the back button. The card carries auto margins instead, which
  // centre it while it fits and give way the moment it does not.
  alignItems: "flex-start",
  justifyContent: "center",
  padding: "24px",
  overflowY: "auto",
  fontFamily: "var(--font-body, system-ui, sans-serif)",
  color: "var(--color-text, #1e1b16)",
};

const card: React.CSSProperties = {
  width: "min(100%, 400px)",
  // centred while there is room, and never clipped when there is not
  margin: "auto 0",
  background: "#fff",
  border: "1px solid var(--color-divider, #e6e0d4)",
  borderRadius: 22,
  padding: "30px 24px 24px",
  boxShadow: "0 10px 30px rgba(30,27,22,.08)",
};

const label: React.CSSProperties = {
  display: "block",
  fontSize: 14,
  fontWeight: 700,
  marginBottom: 7,
};

const field: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid var(--color-neutral-300, #d9d3c6)",
  borderRadius: 12,
  padding: "13px 14px",
  // 16px exactly: below it, iOS zooms the page in when the field is focused
  // and does not zoom back out, which left the app magnified after sign-in
  fontSize: 16,
  fontFamily: "inherit",
  color: "inherit",
  background: "#fff",
};

const primary: React.CSSProperties = {
  width: "100%",
  minHeight: 50,
  border: 0,
  // A pill, as in the reference. The provider buttons match it, so the three
  // read as one stack of choices rather than a button and two afterthoughts.
  borderRadius: 999,
  background: "var(--color-accent, #7a8c3f)",
  color: "#fff",
  fontSize: 15.5,
  fontWeight: 600,
  fontFamily: "inherit",
  cursor: "pointer",
};

const secondary: React.CSSProperties = {
  ...primary,
  minHeight: 48,
  background: "#fff",
  color: "var(--color-text, #1e1b16)",
  border: "1px solid var(--color-neutral-300, #d9d3c6)",
  fontSize: 14.5,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 10,
};

/** The Sign In / Sign Up pair at the top. */
function modeTab(active: boolean): React.CSSProperties {
  return {
    flex: 1,
    minHeight: 36,
    border: 0,
    borderRadius: 999,
    padding: "0 10px",
    font: "inherit",
    fontSize: 13.5,
    fontWeight: 600,
    cursor: "pointer",
    background: active ? "#fff" : "transparent",
    color: active ? "var(--color-text, #1e1b16)" : "#8a8578",
    boxShadow: active ? "0 1px 3px rgba(30,27,22,.16)" : "none",
  };
}

const quietLink: React.CSSProperties = {
  border: 0,
  background: "none",
  padding: 0,
  font: "inherit",
  fontSize: 12.5,
  color: "var(--color-accent, #7a8c3f)",
  fontWeight: 600,
  cursor: "pointer",
};

/** A struck-through eye while the password is showing. */
function EyeIcon({ open }: { open: boolean }) {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" />
      <circle cx="12" cy="12" r="2.7" />
      {open ? <path d="M4 20 20 4" /> : null}
    </svg>
  );
}

export function AuthGate({ onSignedIn }: { onSignedIn: (user: SignedInUser) => void }) {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [googleReady, setGoogleReady] = useState(false);
  const [appleReady, setAppleReady] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  // "asking" is the forgotten-password panel; "asked" is what it becomes once
  // the request is in, whether or not that address turned out to have an
  // account — see the note on forgot() below.
  // "policy" is the privacy policy, shown here rather than opened as a web
  // page: tapping a link took a baker out of the app to a page with no way
  // back into it, and the words are the same words either way.
  const [stage, setStage] = useState<"form" | "asking" | "asked" | "policy">("form");

  useEffect(() => {
    // Only offer Google when the server actually has it configured, rather than
    // showing a button that dead-ends.
    const asks = (path: string, set: (ready: boolean) => void) =>
      apiFetch(path)
        .then((response) => (response.ok ? response.json() : { available: false }))
        .then((payload: { available?: boolean }) => set(payload.available === true))
        .catch(() => set(false));
    asks("/api/auth/google/available", setGoogleReady);
    asks("/api/auth/apple/available", setAppleReady);
  }, []);

  const forgot = () => {
    setError("");
    setStage("asking");
  };

  /**
   * Ask for a reset link.
   *
   * The answer is the same whether or not that address has an account. Telling
   * someone "no account with that email" hands anyone who types an address a
   * way to find out who banks here, and a baker who mistyped their own address
   * is helped by "check your email" just as well.
   */
  const sendResetLink = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await post("/api/auth/forgot", { email });
      setStage("asked");
    } catch {
      setError("Could not reach Baketly. Check your connection.");
    } finally {
      setBusy(false);
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await post(
        mode === "signup" ? "/api/auth/signup" : "/api/auth/login",
        { email, password },
      );
      const payload = (await response.json().catch(() => ({}))) as {
        user?: SignedInUser;
        token?: string;
        error?: string;
      };
      if (!response.ok || !payload.user) {
        setError(payload.error || "Something went wrong. Try again.");
        return;
      }
      // In a browser the cookie is enough; in the app it is the token that
      // proves who this is on every later request.
      if (payload.token) rememberSession(payload.token, remember);
      onSignedIn(payload.user);
    } catch {
      setError("Could not reach Baketly. Check your connection.");
    } finally {
      setBusy(false);
    }
  };

  if (stage === "policy") {
    return (
      <div style={shell}>
        <div style={{ ...card, width: "min(100%, 560px)" }}>
          <button type="button" onClick={() => setStage("form")} style={{ ...quietLink, marginBottom: 16 }}>
            ‹ Back to login
          </button>
          <h1 style={{ fontSize: 24, margin: "0 0 4px", fontFamily: "var(--font-heading, inherit)" }}>
            Baketly privacy policy
          </h1>
          <p style={{ fontSize: 12.5, color: "#8a8578", margin: "0 0 22px" }}>
            Last updated {PRIVACY_UPDATED}
          </p>

          {PRIVACY_SECTIONS.map((section, index) => (
            <div key={section.heading ?? `opening-${index}`} style={{ marginBottom: 20 }}>
              {section.heading ? (
                <h2 style={{ fontSize: 16, margin: "0 0 8px", fontFamily: "var(--font-heading, inherit)" }}>
                  {section.heading}
                </h2>
              ) : null}
              {section.bullets?.length ? (
                <ul style={{ margin: "0 0 10px", paddingLeft: 20 }}>
                  {section.bullets.map((bullet) => (
                    <li key={bullet.lead} style={{ fontSize: 14, lineHeight: 1.6, color: "#3a352c", marginBottom: 7 }}>
                      <strong>{bullet.lead}</strong> {bullet.text}
                    </li>
                  ))}
                </ul>
              ) : null}
              {(section.paragraphs ?? []).map((paragraph) => (
                <p key={paragraph.slice(0, 40)} style={{ fontSize: 14, lineHeight: 1.6, color: "#3a352c", margin: "0 0 10px" }}>
                  {paragraph}
                </p>
              ))}
            </div>
          ))}

          <h2 style={{ fontSize: 16, margin: "0 0 8px", fontFamily: "var(--font-heading, inherit)" }}>
            Getting in touch
          </h2>
          <p style={{ fontSize: 14, lineHeight: 1.6, color: "#3a352c", margin: "0 0 22px" }}>
            Questions, or a request about your data:{" "}
            <a href={`mailto:${policyContact()}`}>{policyContact()}</a>.
          </p>
        </div>
      </div>
    );
  }

  if (stage !== "form") {
    return (
      <div style={shell}>
        <div style={card}>
          <button type="button" onClick={() => setStage("form")} style={{ ...quietLink, marginBottom: 14 }}>
            ‹ Back to login
          </button>
          <h1 style={{ fontSize: 24, margin: "0 0 8px", fontFamily: "var(--font-heading, inherit)" }}>
            {stage === "asked" ? "Check your email" : "Forgotten password"}
          </h1>

          {stage === "asked" ? (
            <p style={{ fontSize: 13.5, color: "#8a8578", margin: 0, lineHeight: 1.55 }}>
              If {email || "that address"} has a Baketly account, a link to set a new password is on
              its way. It is good for one hour.
            </p>
          ) : (
            <form onSubmit={sendResetLink} noValidate>
              <p style={{ fontSize: 13.5, color: "#8a8578", margin: "0 0 18px", lineHeight: 1.55 }}>
                Give us the address you signed up with and we will send a link to set a new one.
              </p>
              <label style={label} htmlFor="bk-auth-forgot-email">
                <span style={{ color: "var(--color-accent, #7a8c3f)" }}>*</span>Email address
              </label>
              <input
                id="bk-auth-forgot-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                placeholder="Your email"
                style={{ ...field, marginBottom: 18 }}
                required
              />
              {error ? (
                <div style={{ color: "#b0563e", fontSize: 12.5, margin: "0 0 12px", lineHeight: 1.45 }}>
                  {error}
                </div>
              ) : null}
              <button type="submit" style={{ ...primary, opacity: busy ? 0.65 : 1 }} disabled={busy}>
                {busy ? "One moment…" : "Send the link"}
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={shell}>
      <div style={card}>
        <h1
          style={{
            fontSize: 27,
            margin: "0 0 4px",
            textAlign: "center",
            fontFamily: "var(--font-heading, inherit)",
          }}
        >
          {mode === "signup" ? "Get Started" : "Welcome Back"}
        </h1>
        <p
          style={{
            margin: "0 0 20px",
            textAlign: "center",
            fontSize: 12.5,
            // tracked out, as in the reference: it reads as a caption under the
            // title rather than as a second, smaller sentence
            letterSpacing: "0.09em",
            color: "#8a8578",
          }}
        >
          {mode === "signup" ? "Set up your bakery" : "Sign in to continue"}
        </p>

        <div
          role="tablist"
          style={{
            display: "flex",
            gap: 4,
            padding: 4,
            marginBottom: 22,
            borderRadius: 999,
            background: "var(--color-neutral-100, #f0ece1)",
          }}
        >
          {(["signin", "signup"] as Mode[]).map((each) => (
            <button
              key={each}
              type="button"
              role="tab"
              aria-selected={mode === each}
              onClick={() => {
                setMode(each);
                setError("");
              }}
              style={modeTab(mode === each)}
            >
              {each === "signin" ? "Sign In" : "Sign Up"}
            </button>
          ))}
        </div>

        <form onSubmit={submit} noValidate>
          <label style={label} htmlFor="bk-auth-email">
            <span style={{ color: "var(--color-accent, #7a8c3f)" }}>*</span>Email address
          </label>
          <input
            id="bk-auth-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            placeholder="Your email"
            style={{ ...field, marginBottom: 16 }}
            required
          />

          <label style={label} htmlFor="bk-auth-password">
            <span style={{ color: "var(--color-accent, #7a8c3f)" }}>*</span>Password
          </label>
          <div style={{ position: "relative" }}>
            <input
              id="bk-auth-password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              placeholder={mode === "signup" ? "At least 8 characters" : "Password"}
              // room for the eye, so a long password never runs under it
              style={{ ...field, paddingRight: 46 }}
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
              style={{
                position: "absolute",
                top: "50%",
                right: 6,
                transform: "translateY(-50%)",
                width: 36,
                height: 36,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: 0,
                borderRadius: 999,
                background: "none",
                color: "#8a8578",
                cursor: "pointer",
              }}
            >
              <EyeIcon open={showPassword} />
            </button>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              margin: "12px 0 20px",
            }}
          >
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={remember}
                onChange={(event) => setRemember(event.target.checked)}
                style={{ width: 17, height: 17, accentColor: "var(--color-accent, #7a8c3f)", margin: 0 }}
              />
              Remember me
            </label>
            <button type="button" onClick={forgot} style={quietLink}>
              Forgot password?
            </button>
          </div>

          {error ? (
            <div style={{ color: "#b0563e", fontSize: 12.5, margin: "0 0 12px", lineHeight: 1.45 }}>
              {error}
            </div>
          ) : null}

          <button type="submit" style={{ ...primary, opacity: busy ? 0.65 : 1 }} disabled={busy}>
            {busy ? "One moment…" : mode === "signup" ? "Create account" : "Log in"}
          </button>
        </form>

        {/* The rule says these are another way in, not a second form. */}
        {googleReady || appleReady ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              margin: "22px 4px",
              fontSize: 11.5,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "#a8a296",
            }}
          >
            <span style={{ flex: 1, height: 1, background: "var(--color-divider, #e6e0d4)" }} />
            or
            <span style={{ flex: 1, height: 1, background: "var(--color-divider, #e6e0d4)" }} />
          </div>
        ) : null}

        {googleReady ? (
          <>
            {/* In a browser this is an ordinary link. In the app it opens the
                system's own browser sheet instead, because Google will not
                accept a sign-in from inside an app's web view. */}
            <a
              href={apiBase() + "/api/auth/google"}
              onClick={(event) => {
                if (!canUseNativeSignIn()) return;
                event.preventDefault();
                startNativeSignIn("google").catch(() =>
                  setError("Could not open Google sign-in. Try your email and password."),
                );
              }}
              style={{ ...secondary, textDecoration: "none" }}
            >
              <svg width="17" height="17" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#4285F4" d="M45 24c0-1.6-.1-2.7-.4-3.9H24v7.1h12c-.2 1.9-1.5 4.7-4.4 6.6l6.7 5.2C42.2 35.5 45 30.3 45 24z" />
                <path fill="#34A853" d="M24 46c5.9 0 10.9-2 14.5-5.3l-6.9-5.4c-1.8 1.3-4.3 2.2-7.6 2.2-5.8 0-10.7-3.8-12.5-9.1l-7.1 5.5C8 41.1 15.4 46 24 46z" />
                <path fill="#FBBC05" d="M11.5 28.4c-.5-1.4-.7-2.9-.7-4.4s.3-3 .7-4.4l-7.1-5.5C2.9 17 2 20.4 2 24s.9 7 2.4 9.9l7.1-5.5z" />
                <path fill="#EA4335" d="M24 10.5c4.1 0 6.9 1.8 8.5 3.3l6.2-6C34.9 4.3 29.9 2 24 2 15.4 2 8 6.9 4.4 14.1l7.1 5.5C13.3 14.3 18.2 10.5 24 10.5z" />
              </svg>
              Continue with Google
            </a>
          </>
        ) : null}

        {appleReady ? (
          <a
            href={apiBase() + "/api/auth/apple"}
            onClick={(event) => {
              if (!canUseNativeSignIn()) return;
              event.preventDefault();
              startNativeSignIn("apple").catch(() =>
                setError("Could not open Apple sign-in. Try your email and password."),
              );
            }}
            style={{ ...secondary, textDecoration: "none", marginTop: googleReady ? 10 : 0 }}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M16.4 12.7c0-2.2 1.8-3.3 1.9-3.4-1-1.5-2.6-1.7-3.2-1.7-1.4-.1-2.7.8-3.3.8-.7 0-1.7-.8-2.8-.8-1.5 0-2.8.8-3.6 2.2-1.5 2.6-.4 6.5 1.1 8.6.7 1 1.6 2.2 2.7 2.2 1.1 0 1.5-.7 2.8-.7s1.6.7 2.8.7c1.1 0 1.9-1 2.6-2.1.8-1.2 1.2-2.4 1.2-2.4-.1 0-2.2-.9-2.2-3.4zM14.2 5.9c.6-.7 1-1.7.9-2.7-.9 0-2 .6-2.6 1.3-.6.6-1.1 1.7-.9 2.6 1 .1 2-.5 2.6-1.2z" />
            </svg>
            Continue with Apple
          </a>
        ) : null}

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            marginTop: 26,
            fontSize: 12,
            color: "#8a8578",
          }}
        >
          <button
            type="button"
            onClick={() => setStage("policy")}
            style={{ ...quietLink, fontSize: 12, fontWeight: 400, color: "inherit" }}
          >
            Privacy Policy
          </button>
          <span>@Baketly {new Date().getFullYear()}</span>
        </div>
      </div>
    </div>
  );
}
