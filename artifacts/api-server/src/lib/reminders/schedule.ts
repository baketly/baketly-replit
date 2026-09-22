// When Baketly should tap the baker on the shoulder.
//
// This works out what reminders are due and when, and nothing else. It does
// not send anything: a phone app will ask it for the next few days and
// schedule those locally, and a web build will ask it on a timer and push
// them. Both need the same answer to the same question, so the answer lives
// here once.
//
// Everything is computed in the baker's own timezone. "Eight in the morning"
// means eight where they are, and a server in another country must not turn
// that into three in the afternoon.

import type { EventRecord, TodoItem, Workspace } from "../ask/workspace";

export type ReminderKind = "todos_today" | "market_tomorrow";

export interface ReminderSettings {
  /** a morning list of what is due today */
  todosDaily: boolean;
  /** "08:00", in the baker's own clock */
  todosAt: string;
  /** the evening before a market */
  marketEve: boolean;
  marketAt: string;
  /** IANA zone, as the phone reports it */
  timezone: string;
}

export const DEFAULT_REMINDERS: ReminderSettings = {
  todosDaily: true,
  todosAt: "08:00",
  marketEve: true,
  marketAt: "18:00",
  timezone: "UTC",
};

export interface Occurrence {
  /** stable, so a scheduler can tell a new reminder from one it already holds */
  id: string;
  kind: ReminderKind;
  /** when to show it, as an instant */
  at: string;
  /** and the same moment in the baker's own clock, for showing in settings */
  localDate: string;
  localTime: string;
  title: string;
  body: string;
}

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

function validTime(value: string, fallback: string): string {
  return TIME.test(value) ? value : fallback;
}

/** How far the baker's clock is from UTC at a given moment, in minutes. */
function offsetMinutes(at: Date, timeZone: string): number {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).formatToParts(at);
    const find = (type: string) => Number(parts.find((part) => part.type === type)?.value || 0);
    const asUtc = Date.UTC(
      find("year"),
      find("month") - 1,
      find("day"),
      // midnight comes back as hour 24 in some locales
      find("hour") % 24,
      find("minute"),
      find("second"),
    );
    return (asUtc - at.getTime()) / 60_000;
  } catch {
    // an unknown zone is treated as UTC rather than dropping the reminder
    return 0;
  }
}

/**
 * The instant at which a wall-clock time happens in a zone.
 *
 * Two passes, because the offset itself depends on the moment: a first guess
 * lands close enough to read the right offset, and the second applies it. That
 * is what keeps an eight o'clock reminder at eight across a clock change.
 */
export function localToInstant(date: string, time: string, timeZone: string): Date {
  const naive = Date.parse(date + "T" + time + ":00Z");
  if (!Number.isFinite(naive)) return new Date(NaN);
  let instant = new Date(naive);
  for (let pass = 0; pass < 2; pass++) {
    instant = new Date(naive - offsetMinutes(instant, timeZone) * 60_000);
  }
  return instant;
}

/** The baker's own date, as a YYYY-MM-DD string. */
export function localDay(at: Date, timeZone: string): string {
  const shifted = new Date(at.getTime() + offsetMinutes(at, timeZone) * 60_000);
  return shifted.toISOString().slice(0, 10);
}

function addDays(day: string, days: number): string {
  const at = new Date(day + "T00:00:00Z");
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}

function plural(count: number, one: string, many: string): string {
  return count + " " + (count === 1 ? one : many);
}

/** Open to-dos for one day, in the order the baker wrote them. */
function todosFor(workspace: Workspace, day: string, today: string): TodoItem[] {
  return workspace.todoItems.filter((item) => {
    if (!item || item.done) return false;
    // a to-do saved before to-dos had a day belongs to today, as on the home screen
    return (item.day || today) === day;
  });
}

function plannedEventsOn(workspace: Workspace, day: string): EventRecord[] {
  return workspace.events.filter(
    (event) =>
      event.status !== "completed" && (event.occurredAt || "").slice(0, 10) === day,
  );
}

/**
 * Every reminder due between now and `days` from now, soonest first.
 *
 * A phone schedules these locally and re-asks when the app opens; a server
 * would ask on a timer and send the ones that have come due. Returning
 * occurrences rather than sending anything is what lets both work from the
 * same rules.
 */
export function upcomingReminders(
  workspace: Workspace,
  settings: ReminderSettings,
  now: Date = new Date(),
  days = 7,
): Occurrence[] {
  const timezone = settings.timezone || "UTC";
  const todosAt = validTime(settings.todosAt, DEFAULT_REMINDERS.todosAt);
  const marketAt = validTime(settings.marketAt, DEFAULT_REMINDERS.marketAt);
  const today = localDay(now, timezone);
  const found: Occurrence[] = [];

  for (let offset = 0; offset <= days; offset++) {
    const day = addDays(today, offset);

    // ---- what is on the list for that day ---------------------------------
    if (settings.todosDaily) {
      const todos = todosFor(workspace, day, today);
      if (todos.length > 0) {
        const at = localToInstant(day, todosAt, timezone);
        if (at.getTime() > now.getTime()) {
          const first = String(todos[0]?.text || "").slice(0, 60);
          found.push({
            id: "todos-" + day,
            kind: "todos_today",
            at: at.toISOString(),
            localDate: day,
            localTime: todosAt,
            title: todos.length === 1 ? "One thing to do today" : plural(todos.length, "thing", "things") + " to do today",
            body:
              todos.length === 1
                ? first
                : first + " and " + plural(todos.length - 1, "other", "others"),
          });
        }
      }
    }

    // ---- a market tomorrow -------------------------------------------------
    if (settings.marketEve) {
      // the reminder is the evening before, so it is about the next day
      const marketDay = addDays(day, 1);
      for (const event of plannedEventsOn(workspace, marketDay)) {
        const at = localToInstant(day, marketAt, timezone);
        if (at.getTime() <= now.getTime()) continue;
        const planned = (event.plannedItems || []).reduce(
          (sum, item) => sum + (Number(item?.quantity) || 0),
          0,
        );
        found.push({
          id: "market-" + (event.id || marketDay),
          kind: "market_tomorrow",
          at: at.toISOString(),
          localDate: day,
          localTime: marketAt,
          title: (event.name || "A market") + " is tomorrow",
          body: planned > 0
            ? plural(planned, "item", "items") + " to bake before it"
            : "Nothing planned to bake yet",
        });
      }
    }
  }

  return found.sort((a, b) => a.at.localeCompare(b.at));
}

/** Settings as stored, with anything missing filled in. */
export function readSettings(value: unknown): ReminderSettings {
  const stored = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    todosDaily: stored.todosDaily !== false,
    todosAt: validTime(String(stored.todosAt || ""), DEFAULT_REMINDERS.todosAt),
    marketEve: stored.marketEve !== false,
    marketAt: validTime(String(stored.marketAt || ""), DEFAULT_REMINDERS.marketAt),
    timezone: typeof stored.timezone === "string" && stored.timezone ? stored.timezone : "UTC",
  };
}
