// Google Places discovery: the provider that knows websites and ratings.
//
// Optional on purpose. Without GOOGLE_PLACES_API_KEY the whole provider sits
// out and OpenStreetMap answers alone, which is how development runs. The key
// never leaves the server.
//
// Places API (New) rather than the legacy endpoint: it takes a field mask, so
// a search costs only the fields asked for, and it returns the website and
// review count the legacy nearby search leaves out.

import { bakeryId } from "../store";
import type { Bakery } from "../types";
import { normalizeBakeryName, websiteDomain } from "./index";
import { bakeryScore, collapseSameShop } from "./rank";

const ENDPOINT = "https://places.googleapis.com/v1/places:searchNearby";
const TEXT_ENDPOINT = "https://places.googleapis.com/v1/places:searchText";
const TIMEOUT_MS = 8_000;
// what a home baker competes with; Google's own type names
const INCLUDED_TYPES = ["bakery", "dessert_shop", "cake_shop", "donut_shop"];
const FIELDS = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.addressComponents",
  "places.location",
  "places.websiteUri",
  "places.rating",
  "places.userRatingCount",
  // asked for so an ice cream chain can be told from a bakery
  "places.types",
  "places.primaryType",
].join(",");

// Google's dessert_shop covers far more than bakeries, and a home baker
// pricing a sourdough is not competing with Cold Stone Creamery. Searching
// four types across five towns returned ninety-nine places, and twenty-two of
// them were ice cream parlours, gelato counters, chocolatiers, a card shop, a
// cocktail bar and a boat rental that happens to sell cones — each one taking
// a slot from a bakery and filling the product pool with things no loaf can be
// priced against.
//
// A place is dropped if it carries one of these types at all, and that is safe
// because of the line above it: Google gives every real bakery the "bakery"
// type, so a bakery that also sells chocolates or candy is kept on its own
// bakery-ness before these types are ever consulted. Of the twenty-two
// dropped across those towns, none carried "bakery".
const FROZEN_TYPES = new Set([
  "ice_cream_shop",
  "frozen_yogurt_shop",
  "juice_shop",
  "candy_store",
  "chocolate_shop",
]);

function sellsBakes(types: string[] | undefined, primaryType: string | undefined): boolean {
  const all = new Set(types ?? []);
  // its own bakery-ness settles it, whatever else it also sells
  if (all.has("bakery") || primaryType === "bakery") return true;
  if (primaryType && FROZEN_TYPES.has(primaryType)) return false;
  for (const type of all) {
    if (FROZEN_TYPES.has(type)) return false;
  }
  return true;
}

export function googlePlacesConfigured(): boolean {
  return !!process.env.GOOGLE_PLACES_API_KEY;
}

/** One Places request, bounded. Throws on a provider failure. */
async function placesSearch(
  endpoint: string,
  apiKey: string,
  body: Record<string, unknown>,
): Promise<PlacesResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": FIELDS,
      },
      signal: controller.signal,
      body: JSON.stringify(body),
    });
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error("places " + response.status + " " + detail.slice(0, 200));
  }
  return (await response.json()) as PlacesResponse;
}

interface AddressComponent {
  longText?: string;
  shortText?: string;
  types?: string[];
}

interface PlacesResponse {
  places?: Array<{
    id?: string;
    displayName?: { text?: string };
    formattedAddress?: string;
    addressComponents?: AddressComponent[];
    location?: { latitude?: number; longitude?: number };
    websiteUri?: string;
    types?: string[];
    primaryType?: string;
    rating?: number;
    userRatingCount?: number;
  }>;
}

function component(components: AddressComponent[] | undefined, type: string): string | null {
  const found = (components || []).find(
    (entry) => Array.isArray(entry?.types) && entry.types.includes(type),
  );
  return found?.longText || found?.shortText || null;
}

/** Straight-line kilometres, for ordering and for the distance shown. */
function distanceKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/**
 * Bakeries around a point, the most bakery-like first and the nearest among
 * equals. Throws on a provider failure so the caller can log it and fall
 * back; it never returns a half-answer silently.
 */
export async function googlePlacesBakeries(
  origin: { latitude: number; longitude: number },
  radiusKm: number,
  limit: number,
  /** what the baker sells, as the questions a person would type for it */
  queries: string[] = [],
): Promise<Bakery[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return [];

  const circle = {
    center: { latitude: origin.latitude, longitude: origin.longitude },
    // Google's own ceiling is 50 km
    radius: Math.min(50_000, Math.round(radiusKm * 1000)),
  };

  // Two searches, side by side.
  //
  // Nearest-first finds what is round the corner, and it is always asked for
  // Google's full page, never just the number of slots to fill: asking for
  // exactly `limit` and then dropping the parlours left the list SHORT of
  // the limit, because a dropped place freed a slot no other bakery could
  // take. One search costs the same whatever this number is.
  //
  // The second search asks the question a person would type -- "bakery" --
  // ranked the way Google ranks it. In a dense town centre the twenty nearest
  // places tagged bakery are coffee shops, doughnut counters and a creamery,
  // and the bread bakeries a mile out are never among them; asked by name,
  // Google puts those first. It is allowed to fail on its own, because the
  // nearby search is the one that has to answer.
  //
  // And one more search per kind of thing the baker sells, up to two: a baker
  // of loaves is asking about the bread bakeries, and "bread bakery" finds
  // them where "bakery" alone finds the patisseries first.
  const textQueries = ["bakery", ...queries.filter((query) => query !== "bakery")].slice(0, 3);
  const [nearby, ...byRelevance] = await Promise.all([
    placesSearch(ENDPOINT, apiKey, {
      includedTypes: INCLUDED_TYPES,
      maxResultCount: 20,
      rankPreference: "DISTANCE",
      locationRestriction: { circle },
    }),
    ...textQueries.map((textQuery) =>
      placesSearch(TEXT_ENDPOINT, apiKey, {
        textQuery,
        // only the plain question is held to Google's bakery type; "cake
        // shop" is allowed to find a cake shop
        ...(textQuery === "bakery" ? { includedType: "bakery" } : {}),
        maxResultCount: 20,
        rankPreference: "RELEVANCE",
        locationBias: { circle },
      }).catch((): PlacesResponse => ({ places: [] })),
    ),
  ]);

  // the same place from any two searches is one place
  const seen = new Set<string>();
  const places = [
    ...(nearby.places ?? []),
    ...byRelevance.flatMap((response) => response.places ?? []),
  ].filter((place) => {
    const key = place.id || (place.displayName?.text || "") + "@" + (place.formattedAddress || "");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const now = new Date().toISOString();
  const found: Bakery[] = [];
  const scores = new Map<string, number>();

  for (const place of places) {
    const name = (place.displayName?.text || "").trim();
    if (!name) continue;
    const latitude = Number(place.location?.latitude);
    const longitude = Number(place.location?.longitude);
    const hasPoint = Number.isFinite(latitude) && Number.isFinite(longitude);
    const km = hasPoint
      ? Math.round(distanceKm(origin.latitude, origin.longitude, latitude, longitude) * 10) / 10
      : null;
    // the relevance search is biased towards the circle, not held inside it
    if (km !== null && km > radiusKm * 1.25) continue;
    const normalizedName = normalizeBakeryName(name);
    if (!sellsBakes(place.types, place.primaryType)) continue;
    const website = place.websiteUri || null;
    const domain = websiteDomain(website);
    const googlePlaceId = place.id || null;
    const id = bakeryId({ googlePlaceId, domain, normalizedName });
    scores.set(id, bakeryScore(name, place.types, place.primaryType));
    found.push({
      id,
      googlePlaceId,
      osmId: null,
      name: name.slice(0, 120),
      normalizedName,
      address: place.formattedAddress ? place.formattedAddress.slice(0, 200) : null,
      city:
        component(place.addressComponents, "locality") ||
        component(place.addressComponents, "postal_town"),
      region: component(place.addressComponents, "administrative_area_level_1"),
      country: component(place.addressComponents, "country"),
      latitude: hasPoint ? latitude : null,
      longitude: hasPoint ? longitude : null,
      website: website ? website.slice(0, 300) : null,
      domain,
      rating: Number.isFinite(Number(place.rating)) ? Number(place.rating) : null,
      reviewCount: Number.isFinite(Number(place.userRatingCount))
        ? Number(place.userRatingCount)
        : null,
      distanceKm: km,
      discoverySource: "google" as const,
      lastDiscoveredAt: now,
      lastScannedAt: null,
    });
  }

  // one shop per website, the most bakery-like first, and among equals the
  // nearest
  return collapseSameShop(found)
    .sort(
      (a, b) =>
        (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0) ||
        (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9),
    )
    .slice(0, limit);
}
