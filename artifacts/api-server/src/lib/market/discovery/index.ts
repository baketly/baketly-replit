// Which bakeries are near the baker.
//
// Two providers answer that: Google Places, which knows websites, ratings and
// stable place ids, and OpenStreetMap, which is free, needs no key and covers
// shops Google will not return. Google leads when it is configured; OSM fills
// in behind it and stands in entirely when Google is unavailable, so a missing
// key costs coverage rather than the feature.
//
// Whatever answers, the rest of the pipeline is handed the same Bakery shape,
// deduplicated: the same shop found twice is one bakery carrying both ids.

import type { MarketLogger } from "../log";
import { bakeryId, competitorStore } from "../store";
import type { Bakery } from "../types";
import { googlePlacesBakeries, googlePlacesConfigured } from "./google-places";
import { geocodePlace, osmBakeries, osmFailure } from "./osm";

/**
 * How long OpenStreetMap gets when Google has already answered.
 *
 * Overpass can take twenty or thirty seconds -- the whole of a check's
 * patience -- and in the two towns probed it added one real shop and a candy
 * store to Google's fifteen, after eighteen and thirty seconds of waiting.
 * With Google's list in hand it gets a few seconds; alone, it gets the full
 * wait, because then it is the only map there is.
 */
const OSM_ALONGSIDE_MS = 4_000;

/** The lookup's answer, or null if it has not come within the time. */
function osmWithin(lookup: Promise<Bakery[]>, ms: number | null): Promise<Bakery[] | null> {
  if (ms === null) return lookup;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(null), ms);
    lookup.then(
      (found) => {
        clearTimeout(timer);
        resolve(found);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export interface DiscoveryOptions {
  radiusKm?: number;
  limit?: number;
  log: MarketLogger;
  /** the kinds of bake the baker sells, so the search asks for the shops that sell them */
  kinds?: string[];
}

/**
 * The question a person would type to find a shop selling each kind of bake.
 *
 * "Bakery" alone, asked of a town centre, returns the patisseries and the
 * coffee shops; a baker of loaves wants the bread bakeries, and asking for
 * them by name is how Google finds them. Two at most, on top of the plain
 * question, so a check with twelve products does not run twelve searches.
 */
const QUERY_FOR_KIND: Record<string, string> = {
  bread: "bread bakery",
  sourdough: "sourdough bread bakery",
  croissant: "patisserie",
  pastry: "patisserie",
  macaron: "patisserie",
  cake: "cake shop",
  cupcake: "cake shop",
  cheesecake: "cake shop",
  cookie: "cookie bakery",
  brownie: "cookie bakery",
  bar: "cookie bakery",
  donut: "donut shop",
  pie: "pie bakery",
  babka: "jewish bakery",
  cinnamon_roll: "cinnamon roll bakery",
  muffin: "bakery cafe",
};

export function queriesFor(kinds: string[]): string[] {
  const queries: string[] = [];
  for (const kind of kinds) {
    const query = QUERY_FOR_KIND[kind];
    if (query && !queries.includes(query)) queries.push(query);
  }
  return queries.slice(0, 2);
}

export interface DiscoveryResult {
  origin: { latitude: number; longitude: number } | null;
  bakeries: Bakery[];
  sources: Array<"google" | "osm">;
}

/** Lowercased, stripped of the words that differ between two listings of one shop. */
export function normalizeBakeryName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/\b(the|ltd|limited|inc|llc|co|company|bakery|bakehouse|patisserie|boulangerie)\b/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The registrable host of a website, or null: "https://www.a.co.uk/shop" → "a.co.uk". */
export function websiteDomain(website: string | null | undefined): string | null {
  if (!website) return null;
  try {
    const url = new URL(website.includes("://") ? website : "https://" + website);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    return host || null;
  } catch {
    return null;
  }
}

/** Two listings are the same shop when an id, a domain, or a name and a place agree. */
function sameBakery(a: Bakery, b: Bakery): boolean {
  if (a.googlePlaceId && b.googlePlaceId) return a.googlePlaceId === b.googlePlaceId;
  if (a.osmId && b.osmId && a.osmId === b.osmId) return true;
  if (a.domain && b.domain && a.domain === b.domain) return true;
  if (!a.normalizedName || a.normalizedName !== b.normalizedName) return false;
  if (a.latitude === null || a.longitude === null || b.latitude === null || b.longitude === null) {
    // same name, nothing to place them by: treat as the same shop
    return true;
  }
  // same name within a few streets
  const dLat = Math.abs(a.latitude - b.latitude);
  const dLon = Math.abs(a.longitude - b.longitude);
  return dLat < 0.005 && dLon < 0.005;
}

/** The fuller of two records of one shop, keeping every id either knew. */
function mergeBakery(primary: Bakery, other: Bakery): Bakery {
  const pick = <K extends keyof Bakery>(key: K): Bakery[K] =>
    (primary[key] ?? null) === null ? other[key] : primary[key];
  const googlePlaceId = primary.googlePlaceId ?? other.googlePlaceId;
  const osmId = primary.osmId ?? other.osmId;
  const domain = pick("domain");
  const normalizedName = primary.normalizedName || other.normalizedName;
  const merged: Bakery = {
    ...primary,
    googlePlaceId,
    osmId,
    address: pick("address"),
    city: pick("city"),
    region: pick("region"),
    country: pick("country"),
    latitude: pick("latitude"),
    longitude: pick("longitude"),
    website: pick("website"),
    domain,
    rating: pick("rating"),
    reviewCount: pick("reviewCount"),
    distanceKm: primary.distanceKm ?? other.distanceKm,
    discoverySource: googlePlaceId && osmId ? "google+osm" : primary.discoverySource,
    lastScannedAt: primary.lastScannedAt ?? other.lastScannedAt,
  };
  // the id follows whichever identifier now leads, so one shop keeps one row
  merged.id = bakeryId({ googlePlaceId, osmId, domain, normalizedName });
  return merged;
}

/** Google first, then anything OSM knew that Google did not. */
export function mergeBakeries(
  googleFound: Bakery[],
  osmFound: Bakery[],
  log?: MarketLogger,
): Bakery[] {
  const merged: Bakery[] = [...googleFound];
  for (const candidate of osmFound) {
    const index = merged.findIndex((existing) => sameBakery(existing, candidate));
    if (index === -1) {
      merged.push(candidate);
      continue;
    }
    merged[index] = mergeBakery(merged[index], candidate);
    log?.event("BAKERY_DEDUPED", {
      bakeryName: merged[index].name,
      bakeryId: merged[index].id,
      reason: "same shop from both providers",
    });
  }
  // Shops that published a website come first, then the rest, each by
  // distance.
  //
  // The list is cut to a fixed length afterwards, and it used to be cut by
  // distance alone — so a bakery with no website, which can never produce a
  // price, took a slot from one that had a menu online, for being fifty metres
  // closer. Adding Google made that worse rather than better: more shops in
  // the pool, the same number of slots, and the scrapable ones pushed out. A
  // Brooklyn check went from three hundred and sixty-five products to seventy
  // six by gaining a second source.
  //
  // The ones without a site are not dropped. They fill whatever slots are
  // left, nearest first, and they are what the "worth a look yourself" list is
  // made of — a real bakery round the corner with no menu online is still
  // worth knowing about.
  //
  // Within each of those, Google's own order holds. Its list arrives ranked
  // -- real bakeries before the coffee shops and ice cream chains that also
  // carry its bakery tag -- and sorting by distance here undid that, so a
  // creamery fifty metres closer took the slot from the bread bakery a baker
  // is actually competing with. Shops only OSM knew about follow, nearest
  // first. The Google place id is the key because a merge can change a
  // shop's own id.
  const googleRank = new Map(
    googleFound.map((bakery, index) => [bakery.googlePlaceId ?? bakery.id, index]),
  );
  const rankOf = (bakery: Bakery) => googleRank.get(bakery.googlePlaceId ?? bakery.id) ?? 1e6;
  const inOrder = (a: Bakery, b: Bakery) =>
    rankOf(a) - rankOf(b) || (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9);
  const canBePriced = (bakery: Bakery) => !!bakery.website;

  return [
    ...merged.filter(canBePriced).sort(inOrder),
    ...merged.filter((bakery) => !canBePriced(bakery)).sort(inOrder),
  ];
}

/**
 * The bakeries near a place, from whichever providers answer, stored and
 * returned nearest first. Never throws: an empty list is a valid answer and
 * the caller reports that it found nobody rather than failing.
 */
export async function discoverNearbyBakeries(
  place: string,
  options: DiscoveryOptions,
): Promise<DiscoveryResult> {
  const { log } = options;
  const radiusKm = options.radiusKm ?? 12;
  const limit = options.limit ?? 20;
  const startedAt = Date.now();
  log.event("BAKERY_DISCOVERY_STARTED", { place, radiusKm });

  const origin = await geocodePlace(place);
  if (!origin) {
    log.event("BAKERY_DISCOVERY_COMPLETE", { count: 0, reason: "place could not be located" });
    return { origin: null, bakeries: [], sources: [] };
  }

  const sources: Array<"google" | "osm"> = [];
  let googleFound: Bakery[] = [];
  if (googlePlacesConfigured()) {
    try {
      googleFound = await googlePlacesBakeries(
        origin,
        radiusKm,
        limit,
        queriesFor(options.kinds ?? []),
      );
      sources.push("google");
      log.event("BAKERY_DISCOVERY_GOOGLE_SUCCESS", { count: googleFound.length });
    } catch (error) {
      log.event("BAKERY_DISCOVERY_GOOGLE_FAILED", {
        reason: error instanceof Error ? error.message : "unknown",
      });
    }
  } else {
    log.event("BAKERY_DISCOVERY_GOOGLE_SKIPPED", { reason: "GOOGLE_PLACES_API_KEY not set" });
  }

  let osmFound: Bakery[] = [];
  try {
    const waited = await osmWithin(
      osmBakeries(origin, radiusKm, limit),
      googleFound.length >= 5 ? OSM_ALONGSIDE_MS : null,
    );
    if (waited === null) {
      log.event("BAKERY_DISCOVERY_OSM_FALLBACK", {
        count: 0,
        reason:
          "osm did not answer within " + OSM_ALONGSIDE_MS / 1000 + "s; carrying on with google",
      });
    } else {
      osmFound = waited;
    }
    if (osmFound.length) {
      sources.push("osm");
      log.event("BAKERY_DISCOVERY_OSM_FALLBACK", {
        count: osmFound.length,
        reason: googleFound.length ? "osm alongside google" : "osm alone",
      });
    } else if (waited !== null) {
      // an empty answer from a map that failed is not an empty town
      log.event("BAKERY_DISCOVERY_OSM_FALLBACK", {
        count: 0,
        reason: osmFailure() || "no bakeries tagged nearby",
      });
    }
  } catch (error) {
    log.event("BAKERY_DISCOVERY_OSM_FALLBACK", {
      count: 0,
      reason: error instanceof Error ? error.message : "osm lookup failed",
    });
  }

  let bakeries = mergeBakeries(googleFound, osmFound, log).slice(0, limit);

  // Map services have bad days, and a bad day should not turn a town full of
  // bakeries into an empty one. Anything found on a previous check is still
  // near the baker, so it stands in until the providers answer again.
  if (bakeries.length === 0) {
    try {
      const store = await competitorStore();
      const remembered = await store.bakeriesNear(origin.latitude, origin.longitude, radiusKm);
      if (remembered.length) {
        bakeries = remembered.slice(0, limit);
        log.event("BAKERY_DISCOVERY_COMPLETE", {
          count: bakeries.length,
          reason: "providers returned nothing; using bakeries found on an earlier check",
        });
        return { origin, bakeries, sources };
      }
    } catch {
      // nothing remembered either; the caller reports an empty neighbourhood
    }
  }

  // Storing them is what makes the next check cheaper, and what lets a
  // bakery's products outlive the check that found them.
  let stored = bakeries;
  try {
    const store = await competitorStore();
    stored = await store.upsertBakeries(bakeries);
    // upserts return what the store holds, which has no distance in it
    const distances = new Map(bakeries.map((bakery) => [bakery.id, bakery.distanceKm]));
    stored = stored.map((bakery) => ({
      ...bakery,
      distanceKm: distances.get(bakery.id) ?? bakery.distanceKm,
    }));
  } catch (error) {
    log.event("BAKERY_DISCOVERY_GOOGLE_FAILED", {
      reason: error instanceof Error ? "store: " + error.message : "store failed",
    });
  }

  log.event("BAKERY_DISCOVERY_COMPLETE", {
    count: stored.length,
    ms: Date.now() - startedAt,
    withWebsite: stored.filter((bakery) => !!bakery.website).length,
  });
  for (const bakery of stored) {
    if (!bakery.website) {
      log.event("BAKERY_WEBSITE_MISSING", { bakeryId: bakery.id, bakeryName: bakery.name });
    }
  }
  return { origin, bakeries: stored, sources };
}
