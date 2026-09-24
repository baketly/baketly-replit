// Signing in with Google from inside the app.
//
// Google refuses OAuth in an embedded web view — an app pretending to be a
// browser is how credentials get stolen — so the sign-in has to happen in a
// real browser the system owns. iOS gives us one: a Safari sheet that appears
// over the app, shares Safari's cookies, and can hand back to the app through
// its own URL scheme.
//
// So the flow is: open the server's Google route in that sheet, let Google and
// the server do their usual round trip, and let the server finish by redirecting
// to baketly://auth?token=… . iOS brings the app forward with that URL, the
// token is kept, and the sheet closes.
//
// Nothing here imports a Capacitor package. The plugins are read off the global
// the native runtime installs, so this same file builds and runs in a browser,
// where none of it applies.

import { apiBase, isNativeApp, rememberSession } from "./api";

type PluginCall = (...args: unknown[]) => Promise<unknown>;
interface CapacitorPlugins {
  Browser?: { open?: PluginCall; close?: PluginCall };
  App?: { addListener?: (event: string, handler: (data: unknown) => void) => unknown };
}

function plugins(): CapacitorPlugins | null {
  const capacitor = (window as { Capacitor?: { Plugins?: CapacitorPlugins } }).Capacitor;
  return capacitor?.Plugins ?? null;
}

/** True when the app can actually run the native sign-in. */
export function canUseNativeGoogle(): boolean {
  const found = plugins();
  return isNativeApp() && !!found?.Browser?.open && !!found?.App?.addListener;
}

/** Opens Google in the system's own browser sheet. */
export async function startNativeGoogleSignIn(): Promise<void> {
  const url = apiBase() + "/api/auth/google?native=1";
  const found = plugins();
  if (found?.Browser?.open) {
    await found.Browser.open({ url, presentationStyle: "popover" });
    return;
  }
  // Not in the app after all: the ordinary redirect still works.
  window.location.href = url;
}

/**
 * Watches for iOS handing the app back its session.
 *
 * Called once at startup. The handler keeps the token, closes the sheet and
 * reloads, which is the same thing signing in through the form does — the app
 * comes up knowing who it is.
 */
export function listenForSignInReturn(onSignedIn: () => void): void {
  const found = plugins();
  if (!found?.App?.addListener) return;

  found.App.addListener("appUrlOpen", (event: unknown) => {
    const url = (event as { url?: unknown })?.url;
    if (typeof url !== "string" || !url.includes("://auth")) return;
    try {
      // the scheme is ours, so the query is parsed against a dummy origin
      const parsed = new URL(url.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "https://"));
      const token = parsed.searchParams.get("token");
      if (!token) return;
      rememberSession(token);
      found.Browser?.close?.().catch?.(() => {});
      onSignedIn();
    } catch {
      // a malformed callback is not a sign-in; the sheet stays open and the
      // baker can close it themselves
    }
  });
}
