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

export interface DiscoveryOptions {
  radiusKm?: number;
  limit?: number;
  log: MarketLogger;
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
  return merged.sort((a, b) => (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9));
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
      googleFound = await googlePlacesBakeries(origin, radiusKm, limit);
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
    osmFound = await osmBakeries(origin, radiusKm, limit);
    if (osmFound.length) {
      sources.push("osm");
      log.event("BAKERY_DISCOVERY_OSM_FALLBACK", {
        count: osmFound.length,
        reason: googleFound.length ? "osm alongside google" : "osm alone",
      });
    } else {
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

  const bakeries = mergeBakeries(googleFound, osmFound, log).slice(0, limit);

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
