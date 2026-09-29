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

/**
 * True when the page was served by the app rather than by a web server.
 *
 * The overrides exist so the native layout can be looked at in a browser: until
 * there is a signed build on a device, "?native=1" is the only way to see what
 * the phone will show.
 */
export function isNativeApp(): boolean {
  if ((window as { __BAKETLY_FORCE_NATIVE?: unknown }).__BAKETLY_FORCE_NATIVE === true) return true;
  if (window.location.search.includes("native=1")) return true;
  return /^(capacitor|ionic):$/.test(window.location.protocol);
}

export function sessionToken(): string | null {
  try {
    // A remembered session outlives the run; the other kind lives in it alone.
    return window.localStorage.getItem(TOKEN_KEY) ?? window.sessionStorage.getItem(TOKEN_KEY);
  } catch {
    // a browser with storage blocked still has its cookie
    return null;
  }
}

/**
 * Keep the session, or keep it only for now.
 *
 * "Remember me" has to mean something or it has no business being on the
 * screen. Ticked, the token is kept where it survives quitting the app;
 * unticked, it lives in this run alone, and a baker signing in on someone
 * else's phone is signed out when the app closes.
 *
 * Both stores are cleared first either way, so a remembered token from last
 * time cannot outlive a sign-in that asked not to be remembered.
 */
export function rememberSession(token: string | null, persist = true): void {
  try {
    window.localStorage.removeItem(TOKEN_KEY);
    window.sessionStorage.removeItem(TOKEN_KEY);
    if (token) (persist ? window.localStorage : window.sessionStorage).setItem(TOKEN_KEY, token);
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
