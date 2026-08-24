import { Router, type IRouter, type Request, type Response } from "express";

const router: IRouter = Router();

// Photon (OpenStreetMap data, run by Komoot) rather than Nominatim: Nominatim
// states it is not built for prefix search, and it showed it — "tel av"
// returned Singapore. Photon is designed for type-ahead and returns Tel Aviv.
// Restricted to settlements so a query does not surface shops and bus stops,
// and asked for English names so results are readable regardless of locale.
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
        "?limit=6&lang=en" +
        "&osm_tag=place:city&osm_tag=place:town&osm_tag=place:village" +
        "&q=" +
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
      const name = typeof properties.name === "string" ? properties.name : "";
      const region =
        (typeof properties.state === "string" && properties.state) ||
        (typeof properties.county === "string" && properties.county) ||
        "";
      const country = typeof properties.country === "string" ? properties.country : "";
      const label = [name, region === name ? "" : region, country]
        .filter(Boolean)
        .join(", ")
        .slice(0, 160);
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
