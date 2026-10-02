// Which recipe did they mean?
//
// "Create a market with 6 loaves and 15 cookies" names no recipe the baker
// has. It names two kinds of thing, and the bakery has four recipes that are
// loaves and two that are cookies. Handing the chat's question back as words
// -- "which recipes did you mean?" -- puts the typing back on the baker, so
// the app asks with a short list to tap instead.
//
// The list has to be the right short list. Every recipe in the bakery is the
// same as no help at all; what is wanted is the loaves when they said loaves.
// Three things point at that, in order of how much they are worth:
//
//   the group they filed it under   -- "Bread" holds their loaves
//   the words in the recipe's name  -- "Sourdough Loaf 750g" says loaf
//   what they bake for markets      -- when nothing else matches
//
// Spoken plurals are the common case ("loaves", "cookies"), so a word is
// matched against its singular as well, and against the handful of words a
// baker would use for the same thing.

import type { Recipe, Workspace } from "./workspace";

/** One thing the baker can tap. */
export interface Candidate {
  id: string;
  name: string;
  /** why it is on the list, shown small beside the name */
  detail: string;
}

/** at most this many options; a list to tap, not a catalogue */
const MOST_OPTIONS = 6;

function plain(text: unknown): string {
  return String(text ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9א-ת\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The forms a word might be stored under: loaves -> loaf, cookies -> cookie,
 * pastries -> pastry, buns -> bun.
 *
 * English does not say which rule applies from the word alone -- "cookies"
 * drops an s, "pastries" turns ies into y -- so every reading is kept and two
 * words count as the same when any reading matches. Trying only one rule
 * turned cookies into "cooky" and offered the baker their loaves.
 */
function stems(word: string): string[] {
  const forms = new Set<string>([word]);
  if (word.length > 2 && word.endsWith("s") && !word.endsWith("ss")) forms.add(word.slice(0, -1));
  if (word.length > 3 && word.endsWith("es")) forms.add(word.slice(0, -2));
  if (word.length > 3 && word.endsWith("ies")) forms.add(word.slice(0, -3) + "y");
  if (word.length > 3 && word.endsWith("ves")) {
    forms.add(word.slice(0, -3) + "f");
    forms.add(word.slice(0, -3) + "fe");
  }
  return [...forms];
}

/** the same word, allowing for the plural on either side */
function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  const other = new Set(stems(b));
  return stems(a).some((form) => other.has(form));
}

/**
 * Words a baker uses for the same kind of thing.
 *
 * Each line is one kind: the first word is what it is called here, and the
 * rest are what someone might say or name a recipe. A said word and a recipe
 * name that land on the same line are about the same kind of thing.
 */
const KINDS: string[][] = [
  ["loaf", "bread", "sourdough", "baguette", "ciabatta", "focaccia", "challah", "rye", "boule", "batard", "miche", "לחם", "חלה"],
  ["roll", "bun", "bagel", "pretzel", "brioche", "לחמניה", "לחמניות", "בייגל"],
  ["cookie", "biscuit", "shortbread", "macaron", "עוגיה", "עוגיות"],
  ["brownie", "blondie", "flapjack", "bar", "slice"],
  ["cake", "cupcake", "muffin", "loafcake", "cheesecake", "tart", "pie", "עוגה", "עוגות", "מאפין"],
  ["babka", "babkas", "kranz", "krantz", "בבקה", "קראנץ"],
  ["pastry", "croissant", "danish", "scone", "bourekas", "rugelach", "מאפה", "קרואסון", "רוגלך"],
  ["donut", "doughnut", "sufganiyah", "סופגניה", "סופגניות"],
];

/** The kinds a phrase is about: "cookies" -> cookie, "sourdough loaves" -> loaf. */
function kindsOf(phrase: string): Set<string> {
  const found = new Set<string>();
  for (const word of plain(phrase).split(" ")) {
    if (!word) continue;
    const forms = stems(word);
    for (const kind of KINDS) {
      if (kind.some((listed) => forms.includes(listed) || stems(listed).includes(word))) found.add(kind[0]);
    }
  }
  return found;
}

/** how often each recipe has been planned for a market or sold */
function timesUsed(workspace: Workspace): Map<string, number> {
  const counts = new Map<string, number>();
  const bump = (id: unknown) => {
    const key = String(id ?? "");
    if (key) counts.set(key, (counts.get(key) || 0) + 1);
  };
  for (const event of workspace.events) {
    for (const item of event.plannedItems || []) bump(item.productId);
    for (const line of event.lineItems || []) bump(line.productId);
  }
  for (const sale of workspace.sales) {
    for (const line of sale.lineItems || []) bump(line.productId);
  }
  return counts;
}

/**
 * The recipes worth offering for what they said, best first.
 *
 * Returns an empty list only when the bakery has no recipes at all.
 */
export function candidatesFor(said: unknown, workspace: Workspace): Candidate[] {
  const recipes = workspace.recipes.filter((recipe) => recipe && recipe.id);
  if (!recipes.length) return [];

  const query = plain(said);
  const words = query.split(" ").filter((word) => word.length > 2);
  const kinds = kindsOf(query);

  // the groups whose name they said: "cookies" -> the Cookies group
  const groupNames = new Map<string, string>();
  for (const group of workspace.recipeGroups) {
    if (group?.id) groupNames.set(String(group.id), String(group.name || group.id));
  }
  const saidGroups = new Set<string>();
  for (const [id, name] of groupNames) {
    const groupWords = plain(name).split(" ").filter(Boolean);
    const matchesName = groupWords.some((word) => words.some((said) => sameWord(said, word)));
    const matchesKind = [...kindsOf(name)].some((kind) => kinds.has(kind));
    if (matchesName || matchesKind) saidGroups.add(id);
  }

  const used = timesUsed(workspace);
  const scored = recipes.map((recipe) => {
    const name = plain(recipe.name);
    const nameWords = name.split(" ").filter(Boolean);
    let score = 0;
    const why: string[] = [];

    if (query && (name === query || name.includes(query))) {
      score += 10;
    }
    const shared = nameWords.filter((word) => words.some((said) => sameWord(said, word)));
    if (shared.length) score += 6 * shared.length;

    const recipeKinds = kindsOf(recipe.name);
    if (kinds.size && [...recipeKinds].some((kind) => kinds.has(kind))) {
      score += 5;
      why.push("a " + [...recipeKinds].find((kind) => kinds.has(kind)));
    }
    const group = recipe.type ? groupNames.get(String(recipe.type)) : "";
    if (recipe.type && saidGroups.has(String(recipe.type))) {
      score += 4;
      if (group) why.unshift(group);
    }
    // a tie between two loaves goes to the one they actually bake
    score += Math.min(2, (used.get(recipe.id) || 0) / 4);

    return {
      recipe,
      score,
      detail: why[0] || group || "",
    };
  });

  const matched = scored.filter((entry) => entry.score >= 4);
  // Nothing in the bakery looks like what they said -- a new baker, an odd
  // word, a recipe named for a customer. What they bake most is a better
  // guess than the first four alphabetically.
  const pool = matched.length ? matched : scored;
  return pool
    .sort((a, b) => b.score - a.score || (used.get(b.recipe.id) || 0) - (used.get(a.recipe.id) || 0))
    .slice(0, MOST_OPTIONS)
    .map((entry) => ({
      id: entry.recipe.id,
      name: entry.recipe.name || "Untitled recipe",
      detail: matched.length ? entry.detail : "",
    }));
}

/** The same, for the pantry: which ingredient did they mean? */
export function ingredientCandidatesFor(
  said: unknown,
  entries: Array<[string, { name?: string; packagePrice?: number; unit?: string }]>,
): Candidate[] {
  if (!entries.length) return [];
  const query = plain(said);
  const words = query.split(" ").filter((word) => word.length > 2);
  const scored = entries.map(([key, record]) => {
    const name = plain(record.name || key);
    let score = 0;
    if (query && (name === query || name.includes(query) || query.includes(name))) score += 8;
    score += 5 * name.split(" ").filter((word) => words.some((said) => sameWord(said, word))).length;
    return { key, name: record.name || key, score };
  });
  const matched = scored.filter((entry) => entry.score > 0);
  return (matched.length ? matched : scored)
    .sort((a, b) => b.score - a.score)
    .slice(0, MOST_OPTIONS)
    .map((entry) => ({ id: entry.key, name: entry.name, detail: "" }));
}

export { MOST_OPTIONS };
