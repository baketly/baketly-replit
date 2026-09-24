// Putting Baketly's reminders on the phone itself.
//
// The server works out what is due and when — to-dos in the morning, a market
// the evening before — and the phone is what actually raises them. Scheduling
// locally means a reminder arrives with no network, no push service and no
// third party in between; the cost is that the app has to be opened now and
// then to top the schedule up, which a baker does daily anyway.
//
// Reminders are re-read on launch and whenever the app comes back to the
// foreground: a to-do ticked off, or a market moved, should not still buzz.
//
// Nothing here imports a Capacitor package. The plugins come off the global the
// native runtime installs, so this file is inert in a browser rather than
// broken.

import { apiFetch, isNativeApp } from "./api";

interface Occurrence {
  id: string;
  kind: string;
  at: string;
  title: string;
  body: string;
}

type PluginCall = (...args: never[]) => Promise<unknown>;
interface NotificationsPlugin {
  checkPermissions?: PluginCall;
  requestPermissions?: PluginCall;
  getPending?: () => Promise<{ notifications?: Array<{ id: number }> }>;
  cancel?: (options: { notifications: Array<{ id: number }> }) => Promise<unknown>;
  schedule?: (options: { notifications: unknown[] }) => Promise<unknown>;
}

function notifications(): NotificationsPlugin | null {
  const capacitor = (window as {
    Capacitor?: { Plugins?: { LocalNotifications?: NotificationsPlugin } };
  }).Capacitor;
  return capacitor?.Plugins?.LocalNotifications ?? null;
}

function appPlugin(): { addListener?: (event: string, handler: (data: unknown) => void) => unknown } | null {
  const capacitor = (window as {
    Capacitor?: { Plugins?: { App?: { addListener?: (event: string, handler: (data: unknown) => void) => unknown } } };
  }).Capacitor;
  return capacitor?.Plugins?.App ?? null;
}

/**
 * iOS needs a number, and the server sends a name.
 *
 * The same reminder has to keep the same number between runs, or topping the
 * schedule up would raise a second copy of something already scheduled. A hash
 * of the id gives that, and stays inside the 32-bit range iOS accepts.
 */
function numericId(id: string): number {
  let hash = 0;
  for (let index = 0; index < id.length; index++) {
    hash = (hash * 31 + id.charCodeAt(index)) | 0;
  }
  return Math.abs(hash) % 2_000_000_000;
}

async function permitted(plugin: NotificationsPlugin): Promise<boolean> {
  try {
    const current = (await plugin.checkPermissions?.()) as { display?: string } | undefined;
    if (current?.display === "granted") return true;
    if (current?.display === "denied") return false;
    const asked = (await plugin.requestPermissions?.()) as { display?: string } | undefined;
    return asked?.display === "granted";
  } catch {
    return false;
  }
}

/**
 * Replaces what is scheduled with what is now due.
 *
 * Everything Baketly scheduled is cancelled first rather than diffed: the list
 * is a handful of reminders over a fortnight, and a wrong reminder is worse
 * than a rescheduled one.
 */
export async function syncReminders(): Promise<number> {
  const plugin = notifications();
  if (!isNativeApp() || !plugin?.schedule) return 0;
  if (!(await permitted(plugin))) return 0;

  let due: Occurrence[] = [];
  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    const response = await apiFetch(
      "/api/reminders/upcoming?days=14&timezone=" + encodeURIComponent(timezone),
    );
    if (!response.ok) return 0;
    const payload = (await response.json()) as { reminders?: Occurrence[] };
    due = Array.isArray(payload.reminders) ? payload.reminders : [];
  } catch {
    // offline: leave whatever is already scheduled alone rather than clearing
    // it, so a baker on a bad signal still gets this week's reminders
    return 0;
  }

  try {
    const pending = await plugin.getPending?.();
    const existing = pending?.notifications ?? [];
    if (existing.length && plugin.cancel) {
      await plugin.cancel({ notifications: existing.map((entry) => ({ id: entry.id })) });
    }

    const now = Date.now();
    const scheduled = due
      .filter((entry) => Date.parse(entry.at) > now + 30_000)
      .slice(0, 32)
      .map((entry) => ({
        id: numericId(entry.id),
        title: entry.title,
        body: entry.body,
        schedule: { at: new Date(entry.at), allowWhileIdle: true },
        // tapping it opens Baketly, which is the whole point of the reminder
        extra: { kind: entry.kind },
      }));

    if (scheduled.length) await plugin.schedule({ notifications: scheduled });
    return scheduled.length;
  } catch {
    return 0;
  }
}

/** Tops the schedule up on launch, and whenever the app is reopened. */
export function keepRemindersFresh(): void {
  if (!isNativeApp()) return;
  void syncReminders();
  appPlugin()?.addListener?.("appStateChange", (event: unknown) => {
    if ((event as { isActive?: boolean })?.isActive) void syncReminders();
  });
}
