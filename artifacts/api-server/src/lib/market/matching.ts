// Is this competitor's product the same sort of thing as the baker's?
//
// A price only means something next to a price for a comparable product. Six
// cookies and twelve cookies are comparable once each is priced per cookie; a
// cookie and a cookie cake are not comparable at any quantity, and neither are
// a plain cookie and a stuffed gluten-free one.
//
// The decision is made here, from the normalized readings, with reasons
// attached so the screen can say why a competitor was counted. A model is
// never asked to decide something these rules can decide.

import type { MatchQuality, MatchResult, NormalizedProduct, ProductCategory } from "./types";

/** Below this a product is not counted in the market at all. */
export const ACCEPT_THRESHOLD = 0.6;

/** Categories that are near enough to price against each other. */
const RELATED_CATEGORIES: Array<[ProductCategory, ProductCategory]> = [
  ["bread", "sourdough"],
  ["pastry", "croissant"],
  ["cake", "cheesecake"],
  ["bar", "brownie"],
];

/** Flavours that are the same thing under two names. */
const FLAVOUR_FAMILIES: string[][] = [
  ["chocolate_chip", "double_chocolate", "chocolate", "dark_chocolate", "milk_chocolate"],
  ["vanilla", "plain", "classic", "funfetti"],
  ["caramel", "salted_caramel"],
  ["blueberry", "strawberry", "raspberry"],
];

/**
 * Attributes that make a product a different proposition rather than a
 * different flavour, with what it costs a match to differ on one.
 */
const ATTRIBUTE_PENALTIES: Record<string, number> = {
  mini: 0.45,
  giant: 0.45,
  assorted: 0.5,
  tray: 0.45,
  party: 0.3,
  gift: 0.3,
  bundle: 0.3,
  slice: 0.4,
  frozen: 0.2,
  gluten_free: 0.25,
  vegan: 0.25,
  keto: 0.3,
  sugar_free: 0.3,
  dairy_free: 0.2,
  stuffed: 0.3,
  luxury: 0.2,
};

/** Attributes both sharing is worth nothing; only a difference matters. */
function attributeDifferences(a: string[], b: string[]): string[] {
  const left = new Set(a);
  const right = new Set(b);
  const different: string[] = [];
  for (const attribute of Object.keys(ATTRIBUTE_PENALTIES)) {
    if (left.has(attribute) !== right.has(attribute)) different.push(attribute);
  }
  return different;
}

function categoriesRelated(a: ProductCategory, b: ProductCategory): boolean {
  return RELATED_CATEGORIES.some(
    ([left, right]) => (a === left && b === right) || (a === right && b === left),
  );
}

function flavoursRelated(a: string, b: string): boolean {
  return FLAVOUR_FAMILIES.some((family) => family.includes(a) && family.includes(b));
}

function quality(score: number): MatchQuality {
  if (score < ACCEPT_THRESHOLD) return "rejected";
  if (score >= 0.82) return "high";
  if (score >= 0.7) return "medium";
  return "low";
}

/**
 * How comparable a competitor's product is to the baker's, 0–1, with the
 * reasons for it. A rejection carries its reasons too: "why was this shop not
 * counted" is a question the screen should be able to answer.
 */
export function matchProducts(
  user: NormalizedProduct,
  competitor: NormalizedProduct,
): MatchResult {
  const reasons: string[] = [];
  const rejections: string[] = [];
  let score = 1;

  // ---- what kind of thing it is: the one hard requirement ----------------
  if (user.category === "unknown" || competitor.category === "unknown") {
    rejections.push(
      competitor.category === "unknown"
        ? "could not tell what kind of product this is"
        : "could not tell what kind of product yours is",
    );
    return { matchScore: 0, matchQuality: "rejected", reasons, rejections };
  }
  if (user.category !== competitor.category) {
    if (!categoriesRelated(user.category, competitor.category)) {
      rejections.push(
        "different kind of product: " + user.category + " vs " + competitor.category,
      );
      return { matchScore: 0, matchQuality: "rejected", reasons, rejections };
    }
    score -= 0.12;
    reasons.push("related kind of product");
  } else {
    reasons.push("same category");
  }

  // ---- which loaf ---------------------------------------------------------
  // Bread and sourdough are related categories, so a challah would otherwise
  // price against a sourdough. Two named kinds of loaf that differ are two
  // products.
  const breadish = (category: ProductCategory) => category === "bread" || category === "sourdough";
  if (breadish(user.category) && breadish(competitor.category)) {
    const mine = user.subcategory;
    const theirs = competitor.subcategory;
    if (mine && theirs && mine !== theirs) {
      rejections.push("different kind of loaf: " + mine + " vs " + theirs);
      return { matchScore: 0, matchQuality: "rejected", reasons, rejections };
    }
    if (mine && theirs && mine === theirs) reasons.push("same kind of loaf");
    // one of them unnamed — a plain "loaf" might be anything
    if (!mine !== !theirs) score -= 0.15;
  }

  // ---- flavour ------------------------------------------------------------
  if (user.flavor && competitor.flavor) {
    if (user.flavor === competitor.flavor) {
      reasons.push("same flavour");
    } else if (flavoursRelated(user.flavor, competitor.flavor)) {
      score -= 0.08;
      reasons.push("similar flavour");
    } else {
      score -= 0.2;
      rejections.push("different flavour: " + user.flavor + " vs " + competitor.flavor);
    }
  } else if (user.flavor || competitor.flavor) {
    // one side plain, the other named: still the same sort of bake
    score -= 0.08;
  }

  // ---- what sort of version it is ----------------------------------------
  const different = attributeDifferences(user.attributes, competitor.attributes);
  for (const attribute of different) {
    score -= ATTRIBUTE_PENALTIES[attribute];
    rejections.push("only one of them is " + attribute.replace(/_/g, " "));
  }

  // ---- size ---------------------------------------------------------------
  if (user.diameterInches && competitor.diameterInches) {
    const gap = Math.abs(user.diameterInches - competitor.diameterInches);
    // Cakes are sold by size, and two inches is not a detail: an 8" serves
    // about twelve and a 10" about twenty. Close sizes compare with a caveat;
    // further apart they are different products at different prices.
    if (gap === 0) {
      reasons.push("same size");
    } else if (gap <= 2) {
      score -= 0.2;
      reasons.push("close size (" + user.diameterInches + '" vs ' + competitor.diameterInches + '")');
    } else if (gap <= 3) {
      score -= 0.35;
      rejections.push(
        "different size (" + user.diameterInches + '" vs ' + competitor.diameterInches + '")',
      );
    } else {
      score -= 0.6;
      rejections.push(
        "very different size (" + user.diameterInches + '" vs ' + competitor.diameterInches + '")',
      );
    }
  } else if (user.weight && competitor.weight && user.weightUnit === competitor.weightUnit) {
    const ratio =
      Math.max(user.weight, competitor.weight) / Math.min(user.weight, competitor.weight);
    if (ratio <= 1.5) {
      reasons.push("comparable weight");
    } else if (ratio <= 3) {
      score -= 0.15;
    } else {
      score -= 0.4;
      rejections.push("very different weight");
    }
  }

  // ---- quantity -----------------------------------------------------------
  // Different counts are fine: the price is per item by the time it is
  // compared. A wildly different count usually means a different proposition,
  // which the attributes above have often already caught.
  if (user.quantity && competitor.quantity) {
    const ratio =
      Math.max(user.quantity, competitor.quantity) / Math.min(user.quantity, competitor.quantity);
    if (ratio === 1) {
      reasons.push("same quantity");
    } else if (ratio <= 4) {
      reasons.push("comparable quantity per item");
    } else if (ratio <= 12) {
      score -= 0.1;
      reasons.push("very different quantity, priced per item");
    } else {
      score -= 0.25;
      rejections.push("quantity too different to compare");
    }
  } else if (competitor.quantity === null && competitor.unit !== "weight" && competitor.unit !== "diameter") {
    // an unstated count is assumed to be one, which is usually right and
    // occasionally wrong; worth a little doubt rather than a rejection
    score -= 0.1;
  }

  const rounded = Math.max(0, Math.round(score * 100) / 100);
  return { matchScore: rounded, matchQuality: quality(rounded), reasons, rejections };
}
