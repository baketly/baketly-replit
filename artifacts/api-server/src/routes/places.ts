import { Router, type IRouter, type Request, type Response } from "express";

const router: IRouter = Router();

// Photon (OpenStreetMap data, run by Komoot) rather than Nominatim: Nominatim
// states it is not built for prefix search, and it showed it — "tel av"
// returned Singapore. Photon is designed for type-ahead and returns Tel Aviv.
// Not restricted to settlements: bakers enter street addresses as well as
// towns, and filtering to place:city/town/village returned nothing at all for
// "221b baker" or "10 downing". English names are requested so results stay
// readable regardless of locale.
const PHOTON = "https://photon.komoot.io/api/";
const USER_AGENT = "Baketly/1.0 (home bakery pricing app)";
const MIN_QUERY = 3;
const CACHE_TTL_MS = 24 * 60 * 60_000;
const MIN_GAP_MS = 250;

const cache = new Map<string, { at: number; places: string[] }>();
let lastCall = 0;

router.get("/places", async (req: Request, res: Response) => {
  const query = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 120) : "";
  if (query.length < MIN_QUERY) {
    res.json({ places: [] });
    return;
  }
  const key = query.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at <= CACHE_TTL_MS) {
    res.json({ places: hit.places });
    return;
  }

  // Suggestions are a convenience. Any failure returns an empty list and the
  // baker simply types the place themselves.
  try {
    const wait = MIN_GAP_MS - (Date.now() - lastCall);
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastCall = Date.now();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5_000);
    let response: Awaited<ReturnType<typeof fetch>>;
    try {
      const url =
        PHOTON +
        "?limit=6&lang=en&q=" +
        encodeURIComponent(query);
      response = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) {
      res.json({ places: [] });
      return;
    }

    const payload = (await response.json()) as {
      features?: Array<{ properties?: Record<string, unknown> }>;
    };
    const places: string[] = [];
    for (const feature of Array.isArray(payload.features) ? payload.features : []) {
      const properties = feature.properties ?? {};
      const text = (value: unknown) => (typeof value === "string" ? value : "");
      const name = text(properties.name);
      const street = text(properties.street);
      const houseNumber = text(properties.housenumber);
      const city = text(properties.city);
      const region = text(properties.state) || text(properties.county);
      const country = text(properties.country);

      // A street result reads as "12 Rothschild, Tel Aviv, Israel"; a town as
      // "Manchester, England, United Kingdom".
      const streetLine = street ? [houseNumber, street].filter(Boolean).join(" ") : "";
      const head = name && name !== street ? name : streetLine;
      const parts = [head];
      if (streetLine && streetLine !== head) parts.push(streetLine);
      if (city && city !== head) parts.push(city);
      if (region && region !== city && region !== head) parts.push(region);
      if (country) parts.push(country);
      const label = parts.filter(Boolean).join(", ").slice(0, 160);
      if (label && !places.includes(label)) places.push(label);
    }

    if (cache.size > 500) cache.clear();
    cache.set(key, { at: Date.now(), places });
    res.json({ places });
  } catch (error) {
    req.log.warn({ err: error }, "Place lookup failed");
    res.json({ places: [] });
  }
});

export default router;
