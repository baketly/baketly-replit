// How much a place looks like the kind of shop a home baker competes with.
//
// Google gives Cold Stone, Ben & Jerry's and a downtown coffee roaster its
// bakery tag -- they sell an ice cream cake or a muffin -- and nearest-first
// ordering then filled every slot within four hundred metres of the town
// centre with them, while the bread bakeries a mile out never made the list.
// In Portland that was fourteen coffee, donut and dessert shops and one
// bakery; in Boulder, two creameries, a frozen yoghurt chain, two crêperies
// and a supermarket, and no loaf anywhere.
//
// Nothing is dropped here. The real bakeries go first, and the coffee shop
// that also sells croissants fills whatever slots are left.

import type { Bakery } from "../types";

const BAKERY_WORDS =
  /\b(bakery|bakeries|bakehouse|bake\s*shop|bakeshop|breads?|boulangerie|patisserie|pâtisserie|pastry|pastries|panader[ií]a|padaria|konditorei|b[aä]ckerei|bakers?)\b/i;
/** Hebrew for bakery, whose edges \b cannot see. */
const BAKERY_WORDS_HEBREW = /מאפי/;

/** Google primary types for shops whose baking is a sideline. */
const SIDELINE_PRIMARY = new Set([
  "ice_cream_shop",
  "coffee_shop",
  "cafe",
  "grocery_store",
  "supermarket",
  "convenience_store",
  "restaurant",
  "fast_food_restaurant",
  "breakfast_restaurant",
  "brunch_restaurant",
  "sandwich_shop",
  "deli",
  "pizza_restaurant",
  "american_restaurant",
  "french_restaurant",
  "store",
  "food_store",
  "market",
]);

/**
 * Hosts many shops give as "their website". Two bakeries pointing at
 * facebook.com are not one bakery.
 */
const SHARED_HOSTS = new Set([
  "facebook.com",
  "instagram.com",
  "tiktok.com",
  "linkedin.com",
  "linktr.ee",
  "google.com",
  "yelp.com",
  "doordash.com",
  "ubereats.com",
  "grubhub.com",
  "toasttab.com",
  "order.online",
]);

/**
 * Two branches of one shop share one website, one menu and one opinion
 * about price. Portland's St. Honoré came back twice, Broadway and Thurman,
 * and a sourdough was shown "2 bakeries" that were the same bakery. The
 * nearer branch stands for both.
 */
export function collapseSameShop(bakeries: Bakery[]): Bakery[] {
  const byDomain = new Map<string, number>();
  const kept: Bakery[] = [];
  for (const bakery of bakeries) {
    const domain = bakery.domain;
    if (!domain || SHARED_HOSTS.has(domain)) {
      kept.push(bakery);
      continue;
    }
    const at = byDomain.get(domain);
    if (at === undefined) {
      byDomain.set(domain, kept.length);
      kept.push(bakery);
      continue;
    }
    if ((bakery.distanceKm ?? 1e9) < (kept[at].distanceKm ?? 1e9)) kept[at] = bakery;
  }
  return kept;
}

export function bakeryScore(
  name: string,
  types: string[] | undefined,
  primaryType: string | undefined,
): number {
  let score = 0;
  if (primaryType === "bakery") score += 3;
  else if ((types ?? []).includes("bakery")) score += 1;
  if (BAKERY_WORDS.test(name) || BAKERY_WORDS_HEBREW.test(name)) score += 2;
  if (primaryType && SIDELINE_PRIMARY.has(primaryType)) score -= 3;
  // and a supermarket's in-store counter is not a bakery however it is named:
  // "Safeway Bakery" was taking a slot, and filling it with its banners
  if (primaryType === "grocery_store" || primaryType === "supermarket") score -= 2;
  return score;
}
