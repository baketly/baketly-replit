// What a product name actually means.
//
// "Box of 6 Classic Chocolate Chip Cookies" and "Half Dozen Chocolate Chunk
// Cookies" are the same thing to a baker and nothing alike to a string
// comparison. Reading each name into the same structure — what kind of thing,
// which flavour, how many, how big, and what sort of version it is — is what
// lets the matcher compare them on their meaning rather than their wording.
//
// Everything here is deterministic and offline. No model sees a product name
// before this does.

import type { NormalizedProduct, ProductCategory } from "./types";

/** Words that name a kind of bake, longest phrases first so "cookie cake" wins. */
const CATEGORY_WORDS: Array<[RegExp, ProductCategory]> = [
  [/\bcake\s*pops?\b/, "cake_pop"],
  [/\bcinnamon\s*(rolls?|buns?|swirls?)\b/, "cinnamon_roll"],
  [/\bcheese\s*cakes?\b/, "cheesecake"],
  [/\bdessert\s*(box|boxes|board|platter)\b/, "dessert_box"],
  [/\bsourdoughs?\b/, "sourdough"],
  [/\bbabkas?\b/, "babka"],
  [/\bmacarons?\b/, "macaron"],
  [/\bmacaroons?\b/, "macaron"],
  [/\bcup\s*cakes?\b/, "cupcake"],
  [/\bbrownies?\b/, "brownie"],
  [/\bblondies?\b/, "brownie"],
  [/\bmuffins?\b/, "muffin"],
  [/\bcroissants?\b/, "croissant"],
  [/\b(donuts?|doughnuts?)\b/, "donut"],
  [/\bcookies?\b/, "cookie"],
  [/\bbiscuits?\b/, "cookie"],
  [/\bpies?\b/, "pie"],
  [/\btarts?\b/, "pie"],
  [/\b(loaf|loaves|breads?|baguettes?|challahs?|focaccias?)\b/, "bread"],
  [/\b(pastr(y|ies)|danish|scones?)\b/, "pastry"],
  [/\bbars?\b/, "bar"],
  [/\bflapjacks?\b/, "bar"],
  [/\bcakes?\b/, "cake"],
];

/** A cookie cake is a cake. Checked before the plain category words. */
const COMPOUND_CATEGORY: Array<[RegExp, ProductCategory, string]> = [
  [/\bcookie\s*cakes?\b/, "cake", "cookie_cake"],
  [/\bcookie\s*pies?\b/, "cake", "cookie_cake"],
  [/\bbrownie\s*cakes?\b/, "cake", "brownie_cake"],
  [/\bcupcake\s*cakes?\b/, "cake", "cupcake_cake"],
];

/** Flavours, and the words that mean the same flavour. */
const FLAVOURS: Array<[RegExp, string]> = [
  [/\bchocolate\s*chips?\b/, "chocolate_chip"],
  [/\bchoc\s*chips?\b/, "chocolate_chip"],
  [/\bchocolate\s*chunks?\b/, "chocolate_chip"],
  [/\bdouble\s*chocolate\b/, "double_chocolate"],
  [/\bwhite\s*chocolate\b/, "white_chocolate"],
  [/\bdark\s*chocolate\b/, "dark_chocolate"],
  [/\bmilk\s*chocolate\b/, "milk_chocolate"],
  [/\bred\s*velvet\b/, "red_velvet"],
  [/\bsalted\s*caramel\b/, "salted_caramel"],
  [/\bpeanut\s*butter\b/, "peanut_butter"],
  [/\boatmeal\s*raisins?\b/, "oatmeal_raisin"],
  [/\bcookies?\s*(and|n|&)\s*cream\b/, "cookies_and_cream"],
  [/\bvanillas?\b/, "vanilla"],
  [/\bchocolates?\b/, "chocolate"],
  [/\bnutellas?\b/, "nutella"],
  [/\blemons?\b/, "lemon"],
  [/\bcarrots?\b/, "carrot"],
  [/\bbanana\b/, "banana"],
  [/\bblueberr(y|ies)\b/, "blueberry"],
  [/\bstrawberr(y|ies)\b/, "strawberry"],
  [/\braspberr(y|ies)\b/, "raspberry"],
  [/\bcinnamon\b/, "cinnamon"],
  [/\bpistachios?\b/, "pistachio"],
  [/\bfunfetti\b/, "funfetti"],
  [/\bbirthday\b/, "funfetti"],
  [/\bapples?\b/, "apple"],
  [/\bpumpkins?\b/, "pumpkin"],
  [/\bmatcha\b/, "matcha"],
  [/\bcoffee\b/, "coffee"],
  [/\bcaramels?\b/, "caramel"],
  [/\bplain\b/, "plain"],
];

/** Kinds of version: what makes two same-flavour products not comparable. */
const ATTRIBUTES: Array<[RegExp, string]> = [
  [/\bminis?\b/, "mini"],
  [/\bbite\s*sized?\b/, "mini"],
  [/\bgiant\b/, "giant"],
  [/\bjumbo\b/, "giant"],
  [/\blarge\b/, "large"],
  [/\bsmall\b/, "small"],
  [/\bgluten\s*free\b/, "gluten_free"],
  [/\bvegan\b/, "vegan"],
  [/\bdairy\s*free\b/, "dairy_free"],
  [/\bsugar\s*free\b/, "sugar_free"],
  [/\bketo\b/, "keto"],
  [/\bassorted\b/, "assorted"],
  [/\bmixed\b/, "assorted"],
  [/\bvariety\b/, "assorted"],
  [/\bselection\b/, "assorted"],
  [/\bsamplers?\b/, "assorted"],
  [/\btrays?\b/, "tray"],
  [/\bplatters?\b/, "tray"],
  [/\bpart(y|ies)\b/, "party"],
  [/\bstuffed\b/, "stuffed"],
  [/\bfilled\b/, "stuffed"],
  [/\bluxury\b/, "luxury"],
  [/\bgourmet\b/, "luxury"],
  [/\bdeluxe\b/, "luxury"],
  [/\bpremium\b/, "luxury"],
  [/\bclassics?\b/, "classic"],
  [/\bplain\b/, "classic"],
  [/\btraditional\b/, "classic"],
  [/\bslices?\b/, "slice"],
  [/\bgift\b/, "gift"],
  [/\bhampers?\b/, "gift"],
  [/\bbundles?\b/, "bundle"],
  [/\bcombo\b/, "bundle"],
  [/\bfrozen\b/, "frozen"],
  [/\bbake\s*at\s*home\b/, "frozen"],
];

/** Number words, so "half dozen" and "six" read as numbers. */
const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  eighteen: 18,
  twenty: 20,
  "twenty four": 24,
};

const CM_PER_INCH = 2.54;

/** Lowercased, punctuation flattened, so every pattern above sees one shape. */
export function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[×✕]/g, "x")
    // hyphens join words that are two words elsewhere: gluten-free, 8-inch
    .replace(/[_/|,-]/g, " ")
    .replace(/[^a-z0-9"'.\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** How many items a listing is for, or null when the name does not say. */
export function parseQuantity(text: string): number | null {
  // "half dozen", "1/2 dozen", "2 dozen", "dozen"
  const dozen = text.match(/\b(half|1\/2|\d+(?:\.\d+)?)?\s*doz(?:en)?\b/);
  if (dozen) {
    const amount = dozen[1];
    if (!amount) return 12;
    if (amount === "half" || amount === "1/2") return 6;
    const value = Number(amount);
    if (Number.isFinite(value) && value > 0) return Math.round(value * 12);
  }

  const patterns: RegExp[] = [
    // "pack of 6", "box of 12", "set of 4", "case of 24"
    /\b(?:pack|box|set|case|bundle|selection|tray)\s*of\s*(\d{1,3})\b/,
    // "6 pack", "6-pack", "12 piece", "6 pcs", "x6", "6x"
    /\b(\d{1,3})\s*[- ]?\s*(?:pack|pk|piece|pieces|pcs|pc|count|ct|ea)\b/,
    /\bx\s*(\d{1,3})\b/,
    /\b(\d{1,3})\s*x\b/,
    // a leading count: "6 chocolate chip cookies"
    /^(\d{1,3})\s+[a-z]/,
  ];
  for (const pattern of patterns) {
    const found = text.match(pattern);
    if (found) {
      const value = Number(found[1]);
      // above a hundred it is a weight or a year, not a count of bakes
      if (Number.isFinite(value) && value > 0 && value <= 100) return value;
    }
  }

  for (const [word, value] of Object.entries(NUMBER_WORDS)) {
    if (new RegExp("\\b" + word + "\\s+[a-z]").test(text)) return value;
  }

  // "single", "individual" — one of the thing
  if (/\b(single|individual|each|solo)\b/.test(text)) return 1;
  return null;
}

/** Weight, in whatever unit the name gives. */
export function parseWeight(
  text: string,
): { weight: number; weightUnit: "g" | "kg" | "oz" | "lb" } | null {
  const found = text.match(/\b(\d+(?:\.\d+)?)\s*(kgs?|kilos?|grams?|gs?|g|ozs?|oz|lbs?|lb|pounds?)\b/);
  if (!found) return null;
  const value = Number(found[1]);
  if (!Number.isFinite(value) || value <= 0) return null;
  const unit = found[2];
  if (/^k/.test(unit)) return { weight: value, weightUnit: "kg" };
  if (/^(g|gram)/.test(unit)) return { weight: value, weightUnit: "g" };
  if (/^oz/.test(unit)) return { weight: value, weightUnit: "oz" };
  return { weight: value, weightUnit: "lb" };
}

/** Cake and pie sizes, always returned in inches. */
export function parseDiameterInches(text: string): number | null {
  const inches = text.match(/\b(\d{1,2}(?:\.\d)?)\s*(?:"|''|in\b|inch(?:es)?\b)/);
  if (inches) {
    const value = Number(inches[1]);
    if (Number.isFinite(value) && value >= 2 && value <= 24) return value;
  }
  const cm = text.match(/\b(\d{1,2}(?:\.\d)?)\s*cms?\b/);
  if (cm) {
    const value = Number(cm[1]);
    if (Number.isFinite(value) && value >= 5 && value <= 60) {
      return Math.round((value / CM_PER_INCH) * 10) / 10;
    }
  }
  return null;
}

/** Everything the matcher needs, read from a product's name and description. */
export function normalizeProduct(
  name: string,
  description?: string | null,
  /** the shop's own label for it — a Shopify product type, a menu heading —
   *  consulted only when the name itself does not say what kind of bake it is */
  categoryHint?: string | null,
): NormalizedProduct {
  const nameText = normalizeText(name || "");
  // the description helps with quantity and size, never with what kind of
  // thing it is: descriptions mention other products too often
  const extra = normalizeText((description || "").slice(0, 400));
  const both = (nameText + " " + extra).trim();

  let category: ProductCategory = "unknown";
  let subcategory: string | null = null;
  for (const [pattern, compoundCategory, compoundSubcategory] of COMPOUND_CATEGORY) {
    if (pattern.test(nameText)) {
      category = compoundCategory;
      subcategory = compoundSubcategory;
      break;
    }
  }
  if (category === "unknown") {
    for (const [pattern, found] of CATEGORY_WORDS) {
      if (pattern.test(nameText)) {
        category = found;
        break;
      }
    }
  }
  // "Fall Spiced Chocolate Chunk" is a cookie on a page headed Cookies. The
  // shop's own grouping says so where its product names do not.
  if (category === "unknown" && categoryHint) {
    const hintText = normalizeText(categoryHint);
    for (const [pattern, found] of CATEGORY_WORDS) {
      if (pattern.test(hintText)) {
        category = found;
        break;
      }
    }
  }

  let flavor: string | null = null;
  for (const [pattern, found] of FLAVOURS) {
    if (pattern.test(nameText)) {
      flavor = found;
      break;
    }
  }
  if (!subcategory && flavor) subcategory = flavor;

  const attributes: string[] = [];
  for (const [pattern, attribute] of ATTRIBUTES) {
    if (pattern.test(both) && !attributes.includes(attribute)) attributes.push(attribute);
  }

  const quantity = parseQuantity(nameText) ?? parseQuantity(extra);
  const weight = parseWeight(nameText) ?? parseWeight(extra);
  const diameterInches = parseDiameterInches(nameText) ?? parseDiameterInches(extra);

  // A cake is sold by its size, a loaf by its weight, cookies by the piece.
  const unit: NormalizedProduct["unit"] = diameterInches
    ? "diameter"
    : weight
      ? "weight"
      : attributes.includes("slice")
        ? "slice"
        : quantity !== null
          ? "piece"
          : null;

  return {
    category,
    subcategory,
    flavor,
    quantity,
    unit,
    weight: weight ? weight.weight : null,
    weightUnit: weight ? weight.weightUnit : null,
    diameterInches,
    attributes,
    sourceText: nameText,
  };
}

/** A stable key for a product's name, used to spot the same listing twice. */
export function normalizedNameKey(name: string): string {
  return normalizeText(name).replace(/\s+/g, " ").trim().slice(0, 160);
}
