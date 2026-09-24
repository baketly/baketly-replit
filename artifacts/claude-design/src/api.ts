// Where the server is, and how this client proves who it is.
//
// In a browser both answers are easy: the API sits under /api on the same
// origin, and the session cookie rides along on its own. Inside the phone app
// neither holds. The page is served from capacitor://localhost by the app
// itself, so /api points at nothing, and iOS will not carry a cookie to a
// different site. So the app is told the API's address at build time and keeps
// its session token itself, sending it as a bearer header.
//
// Every request to Baketly's own API goes through here, so there is one place
// that knows both answers.

const TOKEN_KEY = "baketly.session";

/**
 * The API's address.
 *
 * Empty in a browser, which keeps today's behaviour exactly: "/api/ask" stays
 * "/api/ask" and the dev server proxies it. The native build is given a real
 * URL at build time.
 */
export function apiBase(): string {
  const injected = (window as { __BAKETLY_API_BASE?: unknown }).__BAKETLY_API_BASE;
  if (typeof injected === "string" && injected) return injected.replace(/\/$/, "");
  const fromBuild = import.meta.env?.VITE_API_BASE;
  if (typeof fromBuild === "string" && fromBuild) return fromBuild.replace(/\/$/, "");
  return "";
}

/** True when the page was served by the app rather than by a web server. */
export function isNativeApp(): boolean {
  return /^(capacitor|ionic):$/.test(window.location.protocol);
}

export function sessionToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    // a browser with storage blocked still has its cookie
    return null;
  }
}

export function rememberSession(token: string | null): void {
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    // nothing to do: the cookie is the fallback, and the app will ask again
  }
}

/**
 * fetch, pointed at Baketly's API and carrying the session.
 *
 * `credentials: "include"` keeps the cookie working for the web build; the
 * bearer header is what works in the app. Sending both is harmless — the
 * server reads whichever it finds.
 */
export function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const base = apiBase();
  const url = path.startsWith("http") ? path : base + path;
  const token = sessionToken();
  const headers = new Headers(init.headers || {});
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", "Bearer " + token);
  }
  return fetch(url, { ...init, headers, credentials: "include" });
}
