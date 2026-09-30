// The bakeries that are actually near the baker.
//
// The price check used to hand a town name to a web search and hope the prices
// it came back with were local. They often were not: a well-known bakery in
// another country outranks a village one, and the search had no idea where the
// baker stood. It also only ever found shops that publish a menu a crawler can
// read, which is a small fraction of the ones on the map.
//
// This looks the neighbours up first, from the same map data the map itself
// draws. The research then has names and distances to work with rather than a
// town and a hope.

const PHOTON = "https://photon.komoot.io/api/";
// The main instance is free, popular, and answers 504 when it is busy — which
// looked from here exactly like a town with no bakeries in it. Mirrors run the
// same data and the same query language, so a busy one costs a second or two
// rather than the whole neighbour list.
const OVERPASS_MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];
const USER_AGENT = "Baketly/1.0 (home bakery pricing app)";

// Photon is free and usually quick, but it has spells of taking the better
// part of ten seconds. Nominatim runs the same map data and is asked only
// when Photon has not answered, which keeps the load off a service that asks
// callers to be gentle.
const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const GEOCODE_TIMEOUT_MS = 15_000;
// Longer than the query's own ceiling below, which is the whole point: a
// busy Overpass is allowed 25 seconds to answer, so a client giving up at
// twelve was cutting off work that would have arrived. From the deployment
// every mirror was being aborted at twelve seconds and the neighbour list
// came back empty, while the same code answered in under two from a desk.
const OVERPASS_TIMEOUT_MS = 30_000;
const CACHE_TTL_MS = 7 * 24 * 60 * 60_000;

/** One thing the map returned: a shop, with where it is and what it is called. */
interface OverpassElement {
  type?: string;
  id?: number;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: Record<string, string>;
}

export interface NearbyBakery {
  name: string;
  /** kilometres from the baker, one decimal */
  km: number;
  town: string;
  website: string;
  /** "node/123", the map's own identifier, for matching a shop to itself later */
  osmId?: string;
  lat?: number;
  lon?: number;
  address?: string;
  country?: string;
}

const cache = new Map<string, { at: number; found: NearbyBakery[] }>();

/** Why the last lookup came back empty, for callers that log. */
export let lastOverpassError: string | null = null;
/** Which mirror answered, so a consistently bad one shows up in the logs. */
export let lastOverpassMirror: string | null = null;

async function withTimeout(url: string, ms: number, init?: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, {
      ...(init || {}),
      headers: { "User-Agent": USER_AGENT, Accept: "application/json", ...(init?.headers || {}) },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/** Where the baker said they sell, as a point on the map. */
export async function geocode(place: string): Promise<{ lat: number; lon: number } | null> {
  return locate(place);
}

/** A place a baker typed, once it has been turned into a point. */
const located = new Map<string, { at: number; point: { lat: number; lon: number } | null }>();

function usablePoint(lat: unknown, lon: unknown): { lat: number; lon: number } | null {
  const latitude = Number(lat);
  const longitude = Number(lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { lat: latitude, lon: longitude };
}

async function fromPhoton(place: string) {
  const response = await withTimeout(
    PHOTON + "?limit=1&lang=en&q=" + encodeURIComponent(place),
    GEOCODE_TIMEOUT_MS,
  );
  if (!response.ok) return null;
  const payload = (await response.json()) as {
    features?: Array<{ geometry?: { coordinates?: unknown } }>;
  };
  const coordinates = payload.features?.[0]?.geometry?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
  return usablePoint(coordinates[1], coordinates[0]);
}

async function fromNominatim(place: string) {
  const response = await withTimeout(
    NOMINATIM + "?format=json&limit=1&q=" + encodeURIComponent(place),
    GEOCODE_TIMEOUT_MS,
  );
  if (!response.ok) return null;
  const payload = (await response.json()) as Array<{ lat?: unknown; lon?: unknown }>;
  const first = Array.isArray(payload) ? payload[0] : null;
  return first ? usablePoint(first.lat, first.lon) : null;
}

/**
 * The point a place name stands for.
 *
 * Two providers, because one of them being slow should not end the price
 * check — which is exactly what happened: Photon began taking nine seconds,
 * the six-second ceiling aborted it, and the abort came out as an exception
 * rather than an empty answer, so the whole check failed rather than
 * carrying on without the neighbours.
 *
 * The answer is kept for a week. Where a baker sells does not move, and this
 * is by far the slowest call in the check.
 */
async function locate(place: string): Promise<{ lat: number; lon: number } | null> {
  const key = place.trim().toLowerCase();
  const remembered = located.get(key);
  if (remembered && Date.now() - remembered.at < CACHE_TTL_MS) return remembered.point;

  let point: { lat: number; lon: number } | null = null;
  for (const ask of [fromPhoton, fromNominatim]) {
    try {
      point = await ask(place);
      if (point) break;
    } catch {
      // a timeout or a refusal: try the other one, then give up quietly
    }
  }

  // a failure is remembered only briefly, so a service having a bad minute
  // does not cost the baker a week
  located.set(key, { at: point ? Date.now() : Date.now() - CACHE_TTL_MS + 60_000, point });
  return point;
}

/** Straight-line kilometres; close enough for "is this one nearby". */
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
 * Bakeries, patisseries and cake shops within `radiusKm`, nearest first.
 * Returns an empty list on any failure: the check still runs without it, just
 * the way it did before.
 */
export async function nearbyBakeries(
  place: string,
  radiusKm = 12,
  limit = 15,
): Promise<NearbyBakery[]> {
  const key = place.trim().toLowerCase() + "|" + radiusKm;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at <= CACHE_TTL_MS) return hit.found;

  const point = await locate(place);
  if (!point) return [];
  const found = await nearbyBakeriesAt(point.lat, point.lon, radiusKm, limit);
  if (cache.size > 200) cache.clear();
  cache.set(key, { at: Date.now(), found });
  return found;
}

/**
 * The same lookup from a point already known, for callers that geocoded it
 * themselves. Carries the map's own id and coordinates, which the price
 * pipeline needs to recognise a shop it has seen before.
 */
export async function nearbyBakeriesAt(
  latitude: number,
  longitude: number,
  radiusKm = 12,
  limit = 15,
): Promise<NearbyBakery[]> {
  const key = "at|" + latitude.toFixed(3) + "," + longitude.toFixed(3) + "|" + radiusKm;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at <= CACHE_TTL_MS) return hit.found;

  try {
    const point = { lat: latitude, lon: longitude };

    const radius = Math.round(radiusKm * 1000);
    // shop=bakery and shop=pastry are the two the map uses for what a home
    // baker competes with; cafes are left out, since their prices are for
    // coffee more often than for cake.
    // Three exact tag matches rather than one regex over them.
    //
    // A regex on a tag cannot use Overpass's index, so it walks every shop in
    // the radius; an exact match is a lookup. In a quiet town nobody notices.
    // In Brooklyn the main mirror answered 504 and the other two timed out, and
    // a baker in one of the densest bakery cities on earth was told there were
    // none nearby. nwr covers nodes, ways and relations in one clause each.
    const around = `(around:${radius},${point.lat},${point.lon})`;
    const query =
      "[out:json][timeout:25];(" +
      `nwr["shop"="bakery"]${around};` +
      `nwr["shop"="pastry"]${around};` +
      `nwr["shop"="confectionery"]${around};` +
      ");out center tags 60;";

    // Every mirror at once, and the first USEFUL answer wins.
    //
    // Not simply the first answer: one mirror carries only part of the map
    // and returns an empty list in under a second, which would win every
    // race and report a town full of bakeries as having none. So an empty
    // answer is set aside, and only stands if every mirror agrees.
    lastOverpassError = null;
    lastOverpassMirror = null;
    const failures: string[] = [];

    interface Answer {
      mirror: string;
      elements: OverpassElement[];
    }

    const answer = await new Promise<Answer | null>((resolve) => {
      let pending = OVERPASS_MIRRORS.length;
      let settled = false;
      let empty: Answer | null = null;
      const give = (value: Answer | null) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };

      for (const mirror of OVERPASS_MIRRORS) {
        withTimeout(mirror, OVERPASS_TIMEOUT_MS, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: "data=" + encodeURIComponent(query),
        })
          .then(async (attempt) => {
            if (!attempt.ok) {
              failures.push(mirror + " returned " + attempt.status);
              return;
            }
            const payload = (await attempt.json()) as { elements?: OverpassElement[] };
            const elements = payload.elements ?? [];
            if (elements.length) give({ mirror, elements });
            else empty = empty ?? { mirror, elements };
          })
          .catch((error: unknown) => {
            failures.push(
              mirror + " " + (error instanceof Error ? error.message : "request failed"),
            );
          })
          .finally(() => {
            pending -= 1;
            // everyone has spoken: an empty answer will have to do
            if (pending === 0) give(empty);
          });
      }
    });

    if (!answer) {
      lastOverpassError = failures.join("; ") || "no mirror answered";
      return [];
    }
    lastOverpassMirror = answer.mirror;
    const payload = { elements: answer.elements };

    const found: NearbyBakery[] = [];
    for (const element of payload.elements ?? []) {
      const tags = element.tags ?? {};
      const name = (tags.name || "").trim();
      if (!name) continue;
      const lat = Number(element.lat ?? element.center?.lat);
      const lon = Number(element.lon ?? element.center?.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      const km = distanceKm(point.lat, point.lon, lat, lon);
      if (km > radiusKm) continue;
      if (found.some((entry) => entry.name.toLowerCase() === name.toLowerCase())) continue;
      const street = [tags["addr:street"], tags["addr:housenumber"]].filter(Boolean).join(" ");
      found.push({
        name: name.slice(0, 80),
        km: Math.round(km * 10) / 10,
        town: (tags["addr:city"] || tags["addr:town"] || "").slice(0, 60),
        website: (tags.website || tags["contact:website"] || "").slice(0, 200),
        osmId: element.type && element.id ? element.type + "/" + element.id : undefined,
        lat,
        lon,
        address: street ? street.slice(0, 160) : undefined,
        country: (tags["addr:country"] || "").slice(0, 60) || undefined,
      });
    }

    found.sort((a, b) => a.km - b.km);
    const nearest = found.slice(0, limit);
    if (cache.size > 200) cache.clear();
    cache.set(key, { at: Date.now(), found: nearest });
    return nearest;
  } catch {
    // A missing neighbour list costs accuracy, not the feature.
    return [];
  }
}
