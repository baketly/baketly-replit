import { useEffect, useState } from "react";

// The sign-in screen is a real React component rendered over the app, not part
// of the generated template. The template is one large string patched by exact
// string matches; a form that guards every account is not something to hang off
// that. It also means the app underneath needs no knowledge of accounts.

export type SignedInUser = { email: string; displayName: string | null; isAdmin: boolean };

type Mode = "signin" | "signup";

async function post(path: string, body?: unknown): Promise<Response> {
  return fetch(path, {
    method: "POST",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
    credentials: "same-origin",
  });
}

export async function fetchCurrentUser(): Promise<SignedInUser | null> {
  try {
    const response = await fetch("/api/auth/me", { credentials: "same-origin" });
    if (!response.ok) return null;
    const payload = (await response.json()) as { user?: SignedInUser | null };
    return payload.user ?? null;
  } catch {
    return null;
  }
}

export async function signOut(): Promise<void> {
  await post("/api/auth/logout").catch(() => undefined);
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
  alignItems: "center",
  justifyContent: "center",
  padding: "24px",
  overflowY: "auto",
  fontFamily: "var(--font-body, system-ui, sans-serif)",
  color: "var(--color-text, #1e1b16)",
};

const card: React.CSSProperties = {
  width: "min(100%, 380px)",
  background: "#fff",
  border: "1px solid var(--color-divider, #e6e0d4)",
  borderRadius: 18,
  padding: "26px 22px",
  boxShadow: "0 10px 30px rgba(30,27,22,.08)",
};

const field: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid var(--color-neutral-300, #d9d3c6)",
  borderRadius: 12,
  padding: "12px 13px",
  fontSize: 15,
  fontFamily: "inherit",
  color: "inherit",
  background: "#fff",
  marginBottom: 10,
};

const primary: React.CSSProperties = {
  width: "100%",
  minHeight: 48,
  border: 0,
  borderRadius: 12,
  background: "var(--color-accent, #7a8c3f)",
  color: "#fff",
  fontSize: 15,
  fontWeight: 600,
  fontFamily: "inherit",
  cursor: "pointer",
};

const secondary: React.CSSProperties = {
  ...primary,
  background: "#fff",
  color: "var(--color-text, #1e1b16)",
  border: "1px solid var(--color-neutral-300, #d9d3c6)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 9,
};

export function AuthGate({ onSignedIn }: { onSignedIn: (user: SignedInUser) => void }) {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [googleReady, setGoogleReady] = useState(false);

  useEffect(() => {
    // Only offer Google when the server actually has it configured, rather than
    // showing a button that dead-ends.
    fetch("/api/auth/google/available", { credentials: "same-origin" })
      .then((response) => (response.ok ? response.json() : { available: false }))
      .then((payload: { available?: boolean }) => setGoogleReady(payload.available === true))
      .catch(() => setGoogleReady(false));
  }, []);

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
        error?: string;
      };
      if (!response.ok || !payload.user) {
        setError(payload.error || "Something went wrong. Try again.");
        return;
      }
      onSignedIn(payload.user);
    } catch {
      setError("Could not reach Baketly. Check your connection.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={shell}>
      <div style={card}>
        <div
          style={{
            fontSize: 11,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--color-accent, #7a8c3f)",
            marginBottom: 6,
          }}
        >
          Baketly
        </div>
        <h1 style={{ fontSize: 25, margin: "0 0 6px", fontFamily: "var(--font-heading, inherit)" }}>
          {mode === "signup" ? "Create your account" : "Welcome back"}
        </h1>
        <p style={{ fontSize: 13, color: "#8a8578", margin: "0 0 18px", lineHeight: 1.5 }}>
          {mode === "signup"
            ? "Your ingredients, recipes and sales stay private to you."
            : "Sign in to your bakery."}
        </p>

        <form onSubmit={submit} noValidate>
          <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 5 }}>
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              placeholder="you@example.com"
              style={{ ...field, marginTop: 5 }}
              required
            />
          </label>
          <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 5 }}>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              placeholder={mode === "signup" ? "At least 8 characters" : ""}
              style={{ ...field, marginTop: 5 }}
              required
            />
          </label>

          {error ? (
            <div style={{ color: "#b0563e", fontSize: 12.5, margin: "2px 0 10px", lineHeight: 1.45 }}>
              {error}
            </div>
          ) : null}

          <button type="submit" style={{ ...primary, opacity: busy ? 0.65 : 1 }} disabled={busy}>
            {busy ? "One moment…" : mode === "signup" ? "Create account" : "Sign in"}
          </button>
        </form>

        {googleReady ? (
          <>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                margin: "16px 0",
                color: "#b9b4a8",
                fontSize: 12,
              }}
            >
              <span style={{ flex: 1, height: 1, background: "var(--color-divider, #e6e0d4)" }} />
              or
              <span style={{ flex: 1, height: 1, background: "var(--color-divider, #e6e0d4)" }} />
            </div>
            <a href="/api/auth/google" style={{ ...secondary, textDecoration: "none" }}>
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

        <div style={{ marginTop: 18, fontSize: 13, textAlign: "center", color: "#8a8578" }}>
          {mode === "signup" ? "Already have an account?" : "New to Baketly?"}{" "}
          <button
            type="button"
            onClick={() => {
              setMode(mode === "signup" ? "signin" : "signup");
              setError("");
            }}
            style={{
              border: 0,
              background: "none",
              padding: 0,
              font: "inherit",
              fontWeight: 600,
              color: "var(--color-accent, #7a8c3f)",
              cursor: "pointer",
            }}
          >
            {mode === "signup" ? "Sign in" : "Create one"}
          </button>
        </div>
      </div>
    </div>
  );
}
