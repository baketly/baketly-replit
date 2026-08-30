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
const OVERPASS = "https://overpass-api.de/api/interpreter";
const USER_AGENT = "Baketly/1.0 (home bakery pricing app)";

const GEOCODE_TIMEOUT_MS = 6_000;
const OVERPASS_TIMEOUT_MS = 12_000;
const CACHE_TTL_MS = 7 * 24 * 60 * 60_000;

export interface NearbyBakery {
  name: string;
  /** kilometres from the baker, one decimal */
  km: number;
  town: string;
  website: string;
}

const cache = new Map<string, { at: number; found: NearbyBakery[] }>();

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
async function locate(place: string): Promise<{ lat: number; lon: number } | null> {
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
  const lon = Number(coordinates[0]);
  const lat = Number(coordinates[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
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

  try {
    const point = await locate(place);
    if (!point) return [];

    const radius = Math.round(radiusKm * 1000);
    // shop=bakery and shop=pastry are the two the map uses for what a home
    // baker competes with; cafes are left out, since their prices are for
    // coffee more often than for cake.
    const query =
      "[out:json][timeout:20];(" +
      `node["shop"~"^(bakery|pastry|confectionery)$"](around:${radius},${point.lat},${point.lon});` +
      `way["shop"~"^(bakery|pastry|confectionery)$"](around:${radius},${point.lat},${point.lon});` +
      ");out center tags 60;";

    const response = await withTimeout(OVERPASS, OVERPASS_TIMEOUT_MS, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "data=" + encodeURIComponent(query),
    });
    if (!response.ok) return [];

    const payload = (await response.json()) as {
      elements?: Array<{
        lat?: number;
        lon?: number;
        center?: { lat?: number; lon?: number };
        tags?: Record<string, string>;
      }>;
    };

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
      found.push({
        name: name.slice(0, 80),
        km: Math.round(km * 10) / 10,
        town: (tags["addr:city"] || tags["addr:town"] || "").slice(0, 60),
        website: (tags.website || tags["contact:website"] || "").slice(0, 200),
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
