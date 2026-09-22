import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_REMINDERS,
  localDay,
  localToInstant,
  readSettings,
  upcomingReminders,
  type ReminderSettings,
} from "./schedule";
import type { Workspace } from "../ask/workspace";

function bakery(overrides: Partial<Workspace> = {}): Workspace {
  return {
    recipes: [],
    sales: [],
    events: [],
    todoItems: [],
    reminders: null,
    ingredients: {},
    packaging: {},
    removedIngredientKeys: [],
    removedPackagingKeys: [],
    recipeGroups: [],
    hourlyRate: 0,
    currency: "USD",
    bakeryName: "Test Bakes",
    bakeryLocation: "West Orange, New Jersey",
    marketCheck: null,
    ...overrides,
  };
}

const newJersey: ReminderSettings = { ...DEFAULT_REMINDERS, timezone: "America/New_York" };

test("eight in the morning means eight where the baker is", () => {
  // New Jersey in September is four hours behind UTC
  assert.equal(localToInstant("2026-09-22", "08:00", "America/New_York").toISOString(), "2026-09-22T12:00:00.000Z");
  // and five hours behind in January, after the clocks change
  assert.equal(localToInstant("2026-01-22", "08:00", "America/New_York").toISOString(), "2026-01-22T13:00:00.000Z");
  // Israel is three hours ahead in September
  assert.equal(localToInstant("2026-09-22", "08:00", "Asia/Jerusalem").toISOString(), "2026-09-22T05:00:00.000Z");
});

test("the baker's own date is theirs, not the server's", () => {
  // 01:30 UTC is still the previous evening in New Jersey
  assert.equal(localDay(new Date("2026-09-22T01:30:00.000Z"), "America/New_York"), "2026-09-21");
  assert.equal(localDay(new Date("2026-09-22T01:30:00.000Z"), "Asia/Jerusalem"), "2026-09-22");
});

test("a day with open to-dos earns one reminder, in the morning", () => {
  const workspace = bakery({
    todoItems: [
      { text: "Order flour", done: false, day: "2026-09-23" },
      { text: "Label the jars", done: false, day: "2026-09-23" },
    ],
  });
  const now = new Date("2026-09-22T12:00:00.000Z"); // 8am in New Jersey
  const found = upcomingReminders(workspace, newJersey, now);

  assert.equal(found.length, 1);
  assert.equal(found[0].kind, "todos_today");
  assert.equal(found[0].localDate, "2026-09-23");
  assert.equal(found[0].localTime, "08:00");
  assert.equal(found[0].at, "2026-09-23T12:00:00.000Z");
  assert.equal(found[0].title, "2 things to do today");
  assert.match(found[0].body, /Order flour and 1 other/);
});

test("finished to-dos, and days without any, are not worth a notification", () => {
  const workspace = bakery({
    todoItems: [
      { text: "Done already", done: true, day: "2026-09-23" },
      { text: "Yesterday's", done: false, day: "2026-09-20" },
    ],
  });
  const found = upcomingReminders(workspace, newJersey, new Date("2026-09-22T12:00:00.000Z"));
  assert.equal(found.length, 0);
});

test("a reminder whose moment has passed today is not scheduled again", () => {
  const workspace = bakery({ todoItems: [{ text: "Bake", done: false, day: "2026-09-22" }] });
  // 9am in New Jersey: this morning's eight o'clock is gone
  const found = upcomingReminders(workspace, newJersey, new Date("2026-09-22T13:00:00.000Z"));
  assert.equal(found.length, 0);
});

test("a market is flagged the evening before", () => {
  const workspace = bakery({
    events: [
      {
        id: "riverside",
        name: "Riverside Night Market",
        occurredAt: "2026-09-25T09:00:00.000Z",
        boothFee: 40,
        status: "planned",
        plannedItems: [
          { productId: "cookies", name: "Cookies", quantity: 20 },
          { productId: "loaf", name: "Sourdough", quantity: 10 },
        ],
        lineItems: [],
      },
    ],
  });
  const found = upcomingReminders(workspace, newJersey, new Date("2026-09-22T12:00:00.000Z"));

  assert.equal(found.length, 1);
  assert.equal(found[0].kind, "market_tomorrow");
  assert.equal(found[0].title, "Riverside Night Market is tomorrow");
  assert.equal(found[0].body, "30 items to bake before it");
  // six in the evening, the day before
  assert.equal(found[0].localDate, "2026-09-24");
  assert.equal(found[0].at, "2026-09-24T22:00:00.000Z");
});

test("a market already done is not reminded about", () => {
  const workspace = bakery({
    events: [
      {
        id: "past",
        name: "Old Fair",
        occurredAt: "2026-09-25T09:00:00.000Z",
        boothFee: 0,
        status: "completed",
        lineItems: [],
      },
    ],
  });
  assert.equal(upcomingReminders(workspace, newJersey, new Date("2026-09-22T12:00:00.000Z")).length, 0);
});

test("switched off means nothing is scheduled", () => {
  const workspace = bakery({ todoItems: [{ text: "Bake", done: false, day: "2026-09-23" }] });
  const off = { ...newJersey, todosDaily: false, marketEve: false };
  assert.equal(upcomingReminders(workspace, off, new Date("2026-09-22T12:00:00.000Z")).length, 0);
});

test("reminders come back soonest first, each with a stable id", () => {
  const workspace = bakery({
    todoItems: [{ text: "Bake", done: false, day: "2026-09-24" }],
    events: [
      {
        id: "riverside",
        name: "Riverside Night Market",
        occurredAt: "2026-09-25T09:00:00.000Z",
        boothFee: 0,
        status: "planned",
        lineItems: [],
      },
    ],
  });
  const now = new Date("2026-09-22T12:00:00.000Z");
  const first = upcomingReminders(workspace, newJersey, now);
  assert.deepEqual(
    first.map((entry) => entry.id),
    ["todos-2026-09-24", "market-riverside"],
  );
  // asked twice, the same reminders carry the same ids, so a scheduler that
  // already holds them does not raise them twice
  const again = upcomingReminders(workspace, newJersey, now);
  assert.deepEqual(first.map((entry) => entry.id), again.map((entry) => entry.id));
});

test("settings fall back rather than breaking on nonsense", () => {
  assert.deepEqual(readSettings(null), DEFAULT_REMINDERS);
  assert.equal(readSettings({ todosAt: "25:00" }).todosAt, "08:00");
  assert.equal(readSettings({ todosAt: "06:30" }).todosAt, "06:30");
  assert.equal(readSettings({ todosDaily: false }).todosDaily, false);
  assert.equal(readSettings({ timezone: "Asia/Jerusalem" }).timezone, "Asia/Jerusalem");
  // an unknown zone is treated as UTC rather than losing the reminder
  const odd = upcomingReminders(
    bakery({ todoItems: [{ text: "Bake", done: false, day: "2026-09-23" }] }),
    { ...DEFAULT_REMINDERS, timezone: "Mars/Olympus" },
    new Date("2026-09-22T12:00:00.000Z"),
  );
  assert.equal(odd.length, 1);
});
