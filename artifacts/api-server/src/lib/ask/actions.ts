// Changes the chat may propose, and none it may make.
//
// Every tool in registry.ts reads. These are the ones that would write, and
// the rule that makes them safe is that they do not. A tool here checks the
// request against the baker's own records -- the recipe exists, the date
// makes sense, the price is a number -- turns it into one exact change, and
// hands that back as a proposal. The app shows the proposal on a card, the
// baker taps Confirm, and the app applies it through the same code its forms
// use. The model never touches a record. A misheard request is wrong on a
// card, where it costs a tap, rather than in the bakery, where it costs a
// market.
//
// Only offered to an app that says it can show the cards. An older build
// never sees these tools, so the model cannot promise it something it has no
// way to display.

import { candidatesFor, eventCandidatesFor, ingredientCandidatesFor, type Candidate } from "./choices";
import type { Recipe, Workspace } from "./workspace";

export type Action =
  | { type: "addTodo"; text: string; day: string }
  | {
      type: "createEvent";
      name: string;
      day: string;
      boothFee: number;
      items: Array<{ productId: string; name: string; quantity: number }>;
    }
  | {
      /** a change to a market already saved; only the fields given change */
      type: "updateEvent";
      eventId: string;
      eventName: string;
      name?: string;
      day?: string;
      boothFee?: number;
      /** lines to set or add; a line already in the market takes the new quantity */
      items?: Array<{ productId: string; name: string; quantity: number }>;
      /** the name, day and fee changes in words, for the card */
      what: string;
    }
  | { type: "setProductPrice"; productId: string; name: string; from: number; to: number }
  | {
      type: "setIngredientPrice";
      key: string;
      name: string;
      from: number;
      to: number;
      packageSize: number | null;
      unit: string;
    };

/**
 * Something the baker is still owed an answer about before a change can be
 * made: which recipe they meant by loaves. The app shows the options as
 * buttons; picking one fills the slot in the action.
 */
export interface Choice {
  /** where the answer goes: item:0 is the first of a market's items */
  slot: string;
  /** what they said that matched no one recipe */
  said: string;
  /** the question, in the words shown above the buttons */
  question: string;
  options: Candidate[];
}

/** One change, ready for the baker to confirm or wave away. */
export interface Proposal {
  id: string;
  /** what will happen, in the words shown on the card */
  summary: string;
  action: Action;
  /** asked on the card first, when something they said fits more than one recipe */
  choices?: Choice[];
}

export const ACTION_NAMES = new Set([
  "addTodo",
  "createEvent",
  "updateEvent",
  "setProductPrice",
  "setIngredientPrice",
]);

export function isAction(name: string): boolean {
  return ACTION_NAMES.has(name);
}

const DATE_DESCRIPTION =
  "The day, as YYYY-MM-DD. Work it out from today's date given to you: 'tomorrow', 'Friday', 'the 15th' are yours to resolve. Omit for today.";

/** What Gemini is told it can set up, when the app can show the cards. */
export const actionDeclarations = [
  {
    name: "addTodo",
    description:
      "Prepares a to-do for the baker's list on a given day, for them to confirm. Use when they ask to add, note, remind or put something on the list.",
    parameters: {
      type: "OBJECT",
      properties: {
        text: { type: "STRING", description: "The to-do, in their words, short." },
        date: { type: "STRING", description: DATE_DESCRIPTION },
      },
      required: ["text"],
    },
  },
  {
    name: "createEvent",
    description:
      "Prepares a new market (an event) on a given day, with what to bake for it, for the baker to confirm. Use when they ask to open, create, book, plan or set up a market or event. Products are given in the baker's own words; the card asks them which recipe when a word fits several. When a market is already prepared on their screen and they are changing it -- its name, date, fee or lineup; 'call this market', 'make it 30', 'add 5 babkas' -- call this again with amends set to that market's id and only what changes, never a second market.",
    parameters: {
      type: "OBJECT",
      properties: {
        amends: {
          type: "STRING",
          description: "The id of a market already prepared on their screen, when they are changing that one rather than opening another. Omit for a new market.",
        },
        name: { type: "STRING", description: "What to call the market. Omit to call it Market, or to leave an amended market's name alone." },
        date: { type: "STRING", description: DATE_DESCRIPTION },
        boothFee: { type: "NUMBER", description: "The booth or table fee, if they said one." },
        items: {
          type: "ARRAY",
          description: "What to bake for it: each product by name, with how many.",
          items: {
            type: "OBJECT",
            properties: {
              product: { type: "STRING", description: "A recipe's name, in the baker's own words." },
              quantity: { type: "NUMBER", description: "How many to bake." },
            },
            required: ["product", "quantity"],
          },
        },
      },
    },
  },
  {
    name: "updateEvent",
    description:
      "Prepares a change to a market they have already saved -- its name, date, booth fee, or what to bake for it -- for the baker to confirm. Use when they ask to change, rename, move, add to or set something on a market that exists: 'set the booth fee for Saturday's market', 'add 10 babkas to the base market', 'move the farmers market to the 17th'. Not for a market still waiting on a card: amend that with createEvent. Say which market in their words; the card asks them which when it is not clear.",
    parameters: {
      type: "OBJECT",
      properties: {
        market: { type: "STRING", description: "Which market, in the baker's own words: its name, or its day. Omit only if they did not say." },
        name: { type: "STRING", description: "A new name for the market, only if they are renaming it." },
        date: { type: "STRING", description: "A new day for the market, as YYYY-MM-DD, only if they are moving it." },
        boothFee: { type: "NUMBER", description: "A new booth fee, only if they said one." },
        items: {
          type: "ARRAY",
          description: "Lines to set or add: each product in their words, with how many. A product already in the market takes the new quantity; a new one is added.",
          items: {
            type: "OBJECT",
            properties: {
              product: { type: "STRING", description: "A recipe's name, in the baker's own words." },
              quantity: { type: "NUMBER", description: "How many to bake." },
            },
            required: ["product", "quantity"],
          },
        },
      },
    },
  },
  {
    name: "setProductPrice",
    description:
      "Prepares a change to one recipe's selling price, for the baker to confirm. Use when they ask to change, set, raise, lower or update a product's price. The product is matched by name.",
    parameters: {
      type: "OBJECT",
      properties: {
        product: { type: "STRING", description: "The recipe's name, as they said it." },
        price: { type: "NUMBER", description: "The new selling price, in their currency." },
      },
      required: ["product", "price"],
    },
  },
  {
    name: "setIngredientPrice",
    description:
      "Prepares a change to what an ingredient's package costs -- and, if they said, the package size -- for the baker to confirm. Use when they say flour went up, the butter now costs, update the price of eggs. The ingredient is matched by name.",
    parameters: {
      type: "OBJECT",
      properties: {
        ingredient: { type: "STRING", description: "The ingredient's name, as they said it." },
        packagePrice: { type: "NUMBER", description: "What a package costs now." },
        packageSize: {
          type: "NUMBER",
          description: "The package size, only if they gave one; in the ingredient's own unit.",
        },
      },
      required: ["ingredient", "packagePrice"],
    },
  },
];

// ---- resolving what they said against what they have -----------------------

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function isoDay(date: Date): string {
  return (
    date.getUTCFullYear() +
    "-" +
    String(date.getUTCMonth() + 1).padStart(2, "0") +
    "-" +
    String(date.getUTCDate()).padStart(2, "0")
  );
}

function shift(todayIso: string, days: number): string {
  const base = new Date(todayIso + "T00:00:00.000Z");
  base.setUTCDate(base.getUTCDate() + days);
  return isoDay(base);
}

/**
 * A day from whatever the model passed, held to a sensible window.
 *
 * The model is told today's date and asked for YYYY-MM-DD, and mostly gives
 * it. "tomorrow" and weekday names are taken too, as a net under it: an
 * action lands on the wrong day only if nothing here could read the request,
 * and then it is refused rather than guessed.
 */
export function resolveDay(input: unknown, todayIso: string): { day: string } | { error: string } {
  const raw = String(input ?? "").trim().toLowerCase();
  if (!raw || raw === "today") return { day: todayIso };
  if (raw === "tomorrow") return { day: shift(todayIso, 1) };
  if (raw === "yesterday") return { day: shift(todayIso, -1) };

  const weekday = WEEKDAYS.findIndex((name) => raw === name || raw === "next " + name || raw === "this " + name);
  if (weekday !== -1) {
    const todayIndex = new Date(todayIso + "T00:00:00.000Z").getUTCDay();
    let ahead = (weekday - todayIndex + 7) % 7;
    // "next friday" on a Friday is a week away; "friday" is today
    if (raw.startsWith("next ") && ahead === 0) ahead = 7;
    return { day: shift(todayIso, ahead) };
  }

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const day = iso[1] + "-" + iso[2] + "-" + iso[3];
    const when = new Date(day + "T00:00:00.000Z");
    if (isNaN(when.getTime()) || isoDay(when) !== day) return { error: "That is not a real date." };
    const today = new Date(todayIso + "T00:00:00.000Z");
    const diffDays = Math.round((when.getTime() - today.getTime()) / 86_400_000);
    if (diffDays < -30) return { error: "That date is more than a month ago." };
    if (diffDays > 366) return { error: "That date is more than a year away." };
    return { day };
  }
  return { error: "I could not tell which day you meant. Say a date, 'tomorrow', or a weekday." };
}

function plain(text: unknown): string {
  return String(text ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9א-ת\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type Found<T> = { one: T } | { several: T[] } | { none: true };

/** By name: an exact match wins; otherwise anything containing the words said. */
function findByName<T>(items: T[], nameOf: (item: T) => string, said: unknown): Found<T> {
  const query = plain(said);
  if (!query) return { none: true };
  const exact = items.filter((item) => plain(nameOf(item)) === query);
  if (exact.length === 1) return { one: exact[0] };
  if (exact.length > 1) return { several: exact };
  const loose = items.filter((item) => {
    const name = plain(nameOf(item));
    return name.includes(query) || query.includes(name);
  });
  if (loose.length === 1) return { one: loose[0] };
  if (loose.length > 1) return { several: loose };
  // last try: every word said appears somewhere in the name
  const words = query.split(" ").filter((word) => word.length > 2);
  const byWords = words.length
    ? items.filter((item) => {
        const name = plain(nameOf(item));
        return words.every((word) => name.includes(word));
      })
    : [];
  if (byWords.length === 1) return { one: byWords[0] };
  if (byWords.length > 1) return { several: byWords };
  return { none: true };
}

const SYMBOLS: Record<string, string> = { USD: "$", EUR: "€", GBP: "£", ILS: "₪", CAD: "CA$", AUD: "A$" };

function money(amount: number, currency: string): string {
  const symbol = SYMBOLS[currency];
  const figure = (Math.round(amount * 100) / 100).toLocaleString("en-US", {
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return symbol ? symbol + figure : figure + " " + currency;
}

function dayLabel(day: string, todayIso: string): string {
  if (day === todayIso) return "today";
  if (day === shift(todayIso, 1)) return "tomorrow";
  const when = new Date(day + "T00:00:00.000Z");
  return when.toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}

let counter = 0;
function proposalId(): string {
  counter += 1;
  return "act_" + Date.now().toString(36) + "_" + counter.toString(36);
}

export interface ActionOutcome {
  /** what the model is told */
  result: Record<string, unknown>;
  /** what the app is handed, when the request could be turned into a change */
  proposal: Proposal | null;
}

function refuse(message: string, extra: Record<string, unknown> = {}): ActionOutcome {
  return { result: { prepared: false, problem: message, ...extra }, proposal: null };
}

function prepare(summary: string, action: Action, choices: Choice[] = []): ActionOutcome {
  const proposal: Proposal = { id: proposalId(), summary, action, ...(choices.length ? { choices } : {}) };
  return {
    result: {
      prepared: true,
      awaitingConfirmation: true,
      summary,
      // said plainly to the model, because it kept saying "done"
      note: "This is prepared, not done. It appears on the baker's screen as a card for them to confirm. Tell them what is waiting for their confirmation; do not say it has been added, created or changed.",
      ...(choices.length
        ? {
            asking: choices.map((choice) => choice.said),
            // The card asks, with their own recipes as buttons. The same
            // question in the reply reads as a second one to answer, and the
            // model used to list recipes the baker was about to tap.
            askingNote:
              "The baker is being asked on the card which recipe they meant by " +
              choices.map((choice) => JSON.stringify(choice.said)).join(" and ") +
              ", with buttons to tap. Do not ask which they meant, and do not list their recipes: say in one short sentence that it is ready and they can pick below.",
          }
        : {}),
    },
    proposal,
  };
}

/** The question put on the card when what they said fits no one recipe. */
function askWhich(slot: string, said: unknown, options: Candidate[]): Choice {
  const what = String(said ?? "").trim() || "that";
  return { slot, said: what, question: "Which did you mean by “" + what + "”?", options };
}

/**
 * Puts what they said to bake into a market's lineup.
 *
 * A line that names one recipe goes in as that recipe. A line that fits
 * several, or none, keeps its place and its quantity with their words standing
 * in, and a question is added for the card to ask. A line for a recipe (or a
 * word) already in the lineup takes the new quantity rather than doubling up:
 * "make it 30 loaves" is a correction, not a second batch.
 */
function lineUp(
  workspace: Workspace,
  items: Array<{ productId: string; name: string; quantity: number }>,
  choices: Choice[],
  rawItems: unknown,
): { ok: true } | { error: string } {
  for (const raw of Array.isArray(rawItems) ? rawItems : []) {
    const item = (raw || {}) as { product?: unknown; quantity?: unknown };
    const quantity = Math.min(Math.round(Number(item.quantity) || 0), 9_999);
    if (quantity <= 0) continue;
    const said = String(item.product ?? "").trim() || "that";
    const found = findByName<Recipe>(workspace.recipes, (recipe) => recipe.name || "", item.product);
    const resolved = "one" in found ? found.one : null;
    // the same line again: a new quantity for it
    const existing = items.findIndex((line) =>
      resolved ? line.productId === resolved.id : plain(line.name) === plain(said));
    if (existing !== -1) {
      items[existing] = { ...items[existing], quantity };
      continue;
    }
    if (resolved) {
      items.push({ productId: resolved.id, name: resolved.name, quantity });
      continue;
    }
    const options = "several" in found
      ? candidatesFor(item.product, { ...workspace, recipes: found.several })
      : candidatesFor(item.product, workspace);
    if (!options.length) return { error: "They have no recipes yet, so there is nothing to bake for a market." };
    choices.push(askWhich("item:" + items.length, said, options));
    items.push({ productId: "", name: said, quantity });
  }
  return { ok: true };
}

/**
 * Runs one action tool: checks the request against the workspace and either
 * prepares a change or says what stopped it. Never throws.
 */
export function runAction(
  workspace: Workspace,
  name: string,
  args: Record<string, unknown>,
  todayIso: string,
  /** changes already prepared on the baker's screen, for the ones that amend them */
  pending: Proposal[] = [],
): ActionOutcome {
  const currency = workspace.currency || "USD";

  if (name === "addTodo") {
    const text = String(args.text ?? "").trim().slice(0, 120);
    if (!text) return refuse("The to-do needs some words.");
    const when = resolveDay(args.date, todayIso);
    if ("error" in when) return refuse(when.error);
    return prepare(
      "Add to " + dayLabel(when.day, todayIso) + "'s list: " + text,
      { type: "addTodo", text, day: when.day },
    );
  }

  if (name === "createEvent") {
    // "Call this market base market and set a fee of $50" is about the
    // market already on the card, not a new one. The model names it by id,
    // and the change starts from what is already there -- the recipes they
    // have picked stay picked, the questions still open stay open.
    const amended = args.amends ? pending.find((p) => p.id === String(args.amends)) : undefined;
    const base = amended && amended.action.type === "createEvent" ? amended.action : null;

    const when = args.date !== undefined && args.date !== ""
      ? resolveDay(args.date, todayIso)
      : base ? { day: base.day } : resolveDay(undefined, todayIso);
    if ("error" in when) return refuse(when.error);
    const saidName = String(args.name ?? "").trim().slice(0, 160);
    const eventName = saidName || (base ? base.name : "Market");
    const boothFee = args.boothFee !== undefined && args.boothFee !== null
      ? Math.max(0, Number(args.boothFee) || 0)
      : base ? base.boothFee : 0;

    const items: Array<{ productId: string; name: string; quantity: number }> = base ? base.items.map((item) => ({ ...item })) : [];
    const choices: Choice[] = base && amended?.choices ? amended.choices.map((choice) => ({ ...choice })) : [];
    const lined = lineUp(workspace, items, choices, args.items);
    if ("error" in lined) return refuse(lined.error);

    const fee = boothFee > 0 ? ", booth fee " + money(boothFee, currency) : "";
    // The lineup is not in the summary: the card lists it line by line, so a
    // line still being asked about can show its buttons where it stands.
    const outcome = prepare(
      "Create " + eventName + " on " + dayLabel(when.day, todayIso) + fee,
      { type: "createEvent", name: eventName, day: when.day, boothFee, items },
      choices,
    );
    if (amended && outcome.proposal) {
      // the same card, changed, rather than a second one beside it
      outcome.proposal.id = amended.id;
      outcome.result.amended = true;
      outcome.result.note = "This changes the market already on their card; it is still waiting for their confirmation. Say what it now is in one short sentence; do not say it is done.";
    }
    return outcome;
  }

  if (name === "updateEvent") {
    const events = workspace.events.filter((event) => event && event.id);
    if (!events.length) return refuse("They have no markets saved yet. A new one is set up with createEvent.");
    const said = String(args.market ?? "").trim();
    const options = eventCandidatesFor(said, events, todayIso);
    // one market named plainly is that market; anything less is asked
    const found = findByName(events, (event) => event.name || "", said);
    const target = "one" in found
      ? found.one
      : said && options.length === 1 ? events.find((event) => String(event.id) === options[0].id) : undefined;
    const choices: Choice[] = [];
    if (!target) choices.push(askWhich("event", said || "that market", options));

    const changes: string[] = [];
    const action: Extract<Action, { type: "updateEvent" }> = {
      type: "updateEvent",
      eventId: target ? String(target.id) : "",
      eventName: target ? target.name || "Market" : said || "that market",
      what: "",
    };
    const newName = String(args.name ?? "").trim().slice(0, 160);
    if (newName) { action.name = newName; changes.push("call it " + newName); }
    if (args.date !== undefined && args.date !== "") {
      const when = resolveDay(args.date, todayIso);
      if ("error" in when) return refuse(when.error);
      action.day = when.day;
      changes.push("move it to " + dayLabel(when.day, todayIso));
    }
    if (args.boothFee !== undefined && args.boothFee !== null) {
      action.boothFee = Math.max(0, Number(args.boothFee) || 0);
      changes.push("booth fee " + money(action.boothFee, currency));
    }
    const items: Array<{ productId: string; name: string; quantity: number }> = [];
    const lined = lineUp(workspace, items, choices, args.items);
    if ("error" in lined) return refuse(lined.error);
    if (items.length) action.items = items;
    if (!changes.length && !items.length) return refuse("Nothing to change was said: a name, a day, a booth fee, or what to bake.");
    action.what = changes.join(", ");
    return prepare(
      "Change " + action.eventName + (action.what ? ": " + action.what : ""),
      action,
      choices,
    );
  }

  if (name === "setProductPrice") {
    const price = Number(args.price);
    if (!Number.isFinite(price) || price <= 0) return refuse("The new price has to be a number above zero.");
    const found = findByName<Recipe>(workspace.recipes, (recipe) => recipe.name || "", args.product);
    if (!("one" in found)) {
      // the card asks which, rather than the chat asking them to type it again
      const options = "several" in found
        ? candidatesFor(args.product, { ...workspace, recipes: found.several })
        : candidatesFor(args.product, workspace);
      if (!options.length) return refuse("They have no recipes yet, so there is no price to change.");
      const said = String(args.product ?? "").trim() || "that";
      const to = Math.round(price * 100) / 100;
      return prepare(
        "Set " + said + " to " + money(to, currency),
        { type: "setProductPrice", productId: "", name: said, from: 0, to },
        [askWhich("product", said, options)],
      );
    }
    const recipe = found.one;
    const from = Number(recipe.price) || 0;
    const to = Math.round(price * 100) / 100;
    if (to === from) return refuse(recipe.name + " is already " + money(from, currency) + ".");
    return prepare(
      "Change " + recipe.name + " from " + money(from, currency) + " to " + money(to, currency),
      { type: "setProductPrice", productId: recipe.id, name: recipe.name, from, to },
    );
  }

  if (name === "setIngredientPrice") {
    const price = Number(args.packagePrice);
    if (!Number.isFinite(price) || price <= 0) return refuse("The package price has to be a number above zero.");
    const entries = Object.entries(workspace.ingredients).filter(
      ([key]) => !workspace.removedIngredientKeys.includes(key),
    );
    const found = findByName(entries, ([key, record]) => record.name || key, args.ingredient);
    if (!("one" in found)) {
      const options = ingredientCandidatesFor(args.ingredient, "several" in found ? found.several : entries);
      if (!options.length) return refuse("Their pantry is empty, so there is no package price to change.");
      const said = String(args.ingredient ?? "").trim() || "that";
      const to = Math.round(price * 100) / 100;
      const sizeSaid = Number(args.packageSize);
      return prepare(
        "Set " + said + " to " + money(to, currency) + " a package",
        {
          type: "setIngredientPrice",
          key: "",
          name: said,
          from: 0,
          to,
          packageSize: Number.isFinite(sizeSaid) && sizeSaid > 0 ? sizeSaid : null,
          unit: "g",
        },
        [askWhich("ingredient", said, options)],
      );
    }
    const [key, record] = found.one;
    const from = Number(record.packagePrice) || 0;
    const to = Math.round(price * 100) / 100;
    const sizeGiven = Number(args.packageSize);
    const packageSize = Number.isFinite(sizeGiven) && sizeGiven > 0 ? sizeGiven : null;
    const unit = String(record.unit || "g");
    const size = packageSize ?? (Number(record.packageSize) || 0);
    const pack = size > 0 ? " (" + size + " " + unit + ")" : "";
    if (to === from && packageSize === null) {
      return refuse((record.name || key) + " already costs " + money(from, currency) + " a package.");
    }
    return prepare(
      "Change " + (record.name || key) + pack + " from " + money(from, currency) + " to " + money(to, currency) + " a package",
      { type: "setIngredientPrice", key, name: record.name || key, from, to, packageSize, unit },
    );
  }

  return refuse("There is no action called " + name + ".");
}
