import assert from "node:assert/strict";
import { test } from "node:test";
import { bakeryScore, collapseSameShop } from "./rank";
import type { Bakery } from "../types";

function shop(id: string, domain: string | null, distanceKm: number): Bakery {
  return {
    id,
    googlePlaceId: id,
    osmId: null,
    name: id,
    normalizedName: id,
    address: null,
    city: null,
    region: null,
    country: null,
    latitude: null,
    longitude: null,
    website: domain ? "https://" + domain : null,
    domain,
    rating: null,
    reviewCount: null,
    distanceKm,
    discoverySource: "google",
    lastDiscoveredAt: new Date().toISOString(),
    lastScannedAt: null,
  };
}

// Portland's St. Honoré came back twice, Broadway and Thurman, one website
// between them, and a sourdough was shown "2 bakeries" that were one bakery.
test("two branches of one shop are one shop, the nearer one", () => {
  const kept = collapseSameShop([
    shop("broadway", "sainthonorebakery.com", 0.4),
    shop("farina", "farinabakery.com", 2.3),
    shop("thurman", "sainthonorebakery.com", 2.6),
  ]);
  assert.deepEqual(
    kept.map((bakery) => bakery.id),
    ["broadway", "farina"],
  );
  // but two shops that both point at Facebook are still two shops
  const social = collapseSameShop([
    shop("one", "facebook.com", 1),
    shop("two", "facebook.com", 2),
    shop("three", null, 3),
  ]);
  assert.equal(social.length, 3);
});

// Google tags Cold Stone, Ben & Jerry's and a coffee roaster "bakery" too, and
// nearest-first then filled a town centre's slots with them while the bread
// bakeries a mile out never made the list.
test("a bakery outranks a creamery that also carries the bakery tag", () => {
  const bakery = bakeryScore("Little T Baker", ["bakery", "cafe"], "bakery");
  const creamery = bakeryScore(
    "Cold Stone Creamery",
    ["ice_cream_shop", "bakery"],
    "ice_cream_shop",
  );
  const coffee = bakeryScore("Boxcar Coffee Roasters", ["coffee_shop", "bakery"], "coffee_shop");
  assert.ok(bakery > creamery);
  assert.ok(bakery > coffee);
});

test("a shop that calls itself a bakery counts as one even when Google is unsure", () => {
  const named = bakeryScore("Grand Central Bakery", ["food", "store"], "cafe");
  const supermarket = bakeryScore("Safeway", ["grocery_store", "bakery"], "grocery_store");
  assert.ok(named > supermarket);
  // in Hebrew as well as English
  assert.ok(bakeryScore("מאפיית רות", [], undefined) > 0);
});
