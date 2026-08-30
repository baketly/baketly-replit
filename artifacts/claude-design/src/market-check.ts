// Local price research. Asks the server what comparable products go for near
// the baker, so they can see when a price is out of step with the area.

export type MarketCompetitor = {
  name: string;
  price: number | null;
  uri: string;
  sourceTitle: string;
};

export type MarketProduct = {
  name: string;
  price: number;
  competitors: MarketCompetitor[];
  localLow: number | null;
  localHigh: number | null;
  verdict: "under" | "in_range" | "over" | "unknown";
  note: string;
  grounded: boolean;
};

export type MarketCheck = {
  checkedAt: string;
  location: string;
  currency: string;
  summary: string;
  products: MarketProduct[];
  sources: Array<{ title: string; uri: string }>;
  searches: string[];
};

/** Twice a week. Checked when the app opens, so a quiet week costs nothing. */
export const MARKET_CHECK_INTERVAL_MS = 3.5 * 24 * 60 * 60 * 1000;

export function marketCheckIsDue(
  check: { checkedAt?: unknown } | null | undefined,
  now: number = Date.now(),
): boolean {
  const checkedAt = check && typeof check.checkedAt === "string" ? Date.parse(check.checkedAt) : NaN;
  if (!Number.isFinite(checkedAt)) return true;
  return now - checkedAt >= MARKET_CHECK_INTERVAL_MS;
}

/** Place suggestions for the location field. Any failure returns nothing, so
 *  the baker can always just type the place themselves. */
export async function suggestPlaces(query: string): Promise<string[]> {
  if (query.trim().length < 3) return [];
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 6_000);
  try {
    const response = await fetch("/api/places?q=" + encodeURIComponent(query.trim()), {
      signal: controller.signal,
    });
    if (!response.ok) return [];
    const payload = (await response.json()) as { places?: unknown };
    return Array.isArray(payload.places)
      ? payload.places.filter((place): place is string => typeof place === "string").slice(0, 6)
      : [];
  } catch {
    return [];
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function runMarketCheck(
  location: string,
  products: Array<{ name: string; price: number }>,
): Promise<MarketCheck> {
  const controller = new AbortController();
  // grounded research runs two model passes and real searches, so allow for it
  const timeout = window.setTimeout(() => controller.abort(), 150_000);
  try {
    const response = await fetch("/api/market-check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ location, products: products.slice(0, 12) }),
      signal: controller.signal,
    });
    const payload = (await response.json().catch(() => ({}))) as Partial<MarketCheck> & {
      error?: unknown;
    };
    if (!response.ok) {
      throw new Error(
        typeof payload.error === "string"
          ? payload.error
          : "Couldn't check local prices right now.",
      );
    }
    const byName = new Map(products.map((product) => [product.name, product.price]));
    return {
      checkedAt: typeof payload.checkedAt === "string" ? payload.checkedAt : new Date().toISOString(),
      location,
      currency: typeof payload.currency === "string" ? payload.currency : "",
      summary: typeof payload.summary === "string" ? payload.summary : "",
      products: (Array.isArray(payload.products) ? payload.products : []).map((entry) => ({
        name: String(entry.name || ""),
        price: byName.get(String(entry.name || "")) ?? 0,
        localLow: typeof entry.localLow === "number" ? entry.localLow : null,
        localHigh: typeof entry.localHigh === "number" ? entry.localHigh : null,
        verdict:
          entry.verdict === "under" || entry.verdict === "over" || entry.verdict === "in_range"
            ? entry.verdict
            : "unknown",
        note: String(entry.note || ""),
        grounded: entry.grounded === true,
        // The server looks for a spread now rather than a single price, and
        // caps at six. Cutting to three here would throw away the sellers that
        // make a range mean anything.
        competitors: (Array.isArray(entry.competitors) ? entry.competitors : [])
          .slice(0, 6)
          .map((seller: Record<string, unknown>) => ({
            name: String(seller.name || ""),
            price: typeof seller.price === "number" ? seller.price : null,
            uri: String(seller.uri || ""),
            sourceTitle: String(seller.sourceTitle || ""),
          })),
      })),
      sources: Array.isArray(payload.sources) ? payload.sources.slice(0, 8) : [],
      searches: Array.isArray(payload.searches) ? payload.searches.slice(0, 6) : [],
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("The local price check took too long. Try again in a moment.");
    }
    if (error instanceof TypeError) {
      throw new Error("Couldn't reach Baketly to check local prices.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}
