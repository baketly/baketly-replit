// Local price research. Asks the server what comparable products go for near
// the baker, so they can see when a price is out of step with the area.

/** One competitor listing: what a shop sells, at what price, and where that was read. */
export type MarketCompetitor = {
  name: string;
  price: number | null;
  uri: string;
  sourceTitle: string;
  /** the competitor's own product name */
  product?: string;
  quantity?: number | null;
  /** that shop's price for the baker's own quantity */
  equivalentPrice?: number | null;
  unitPrice?: number | null;
  currency?: string | null;
  distanceKm?: number | null;
  /** jsonld, shopify, html, ai_extraction, ai_search_fallback… */
  sourceType?: string;
  confidence?: number;
  matchQuality?: string;
  matchScore?: number;
  matchReason?: string;
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
  /** verified: read off shops' own pages. ai_search: found by search, never counted. */
  provenance?: "verified" | "ai_search" | "none";
  unitPrice?: number | null;
  quantity?: number;
  category?: string;
  median?: number | null;
  average?: number | null;
  p25?: number | null;
  p75?: number | null;
  userPercentile?: number | null;
  differenceFromMedianPercent?: number | null;
  suggested?: { competitive: number; market: number; premium: number } | null;
  comparableBakeries?: number;
  comparableProducts?: number;
  /** why there is no market for this one */
  shortfall?: string | null;
};

export type MarketCheck = {
  checkedAt: string;
  location: string;
  currency: string;
  summary: string;
  products: MarketProduct[];
  sources: Array<{ title: string; uri: string }>;
  searches: string[];
  checkId?: string;
  bakeriesFound?: number;
  bakeriesScanned?: number;
  bakeriesWithProducts?: number;
  competitorProducts?: number;
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
  currency = "USD",
): Promise<MarketCheck> {
  const controller = new AbortController();
  // grounded research runs two model passes and real searches, so allow for it
  const timeout = window.setTimeout(() => controller.abort(), 150_000);
  try {
    const response = await fetch("/api/market-check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ location, products: products.slice(0, 12), currency }),
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
    const num = (value: unknown): number | null => (typeof value === "number" ? value : null);
    return {
      checkedAt: typeof payload.checkedAt === "string" ? payload.checkedAt : new Date().toISOString(),
      location,
      currency: typeof payload.currency === "string" ? payload.currency : "",
      summary: typeof payload.summary === "string" ? payload.summary : "",
      checkId: typeof payload.checkId === "string" ? payload.checkId : undefined,
      bakeriesFound: num(payload.bakeriesFound) ?? undefined,
      bakeriesScanned: num(payload.bakeriesScanned) ?? undefined,
      bakeriesWithProducts: num(payload.bakeriesWithProducts) ?? undefined,
      competitorProducts: num(payload.competitorProducts) ?? undefined,
      products: (Array.isArray(payload.products) ? payload.products : []).map((entry) => ({
        name: String(entry.name || ""),
        price: byName.get(String(entry.name || "")) ?? 0,
        localLow: num(entry.localLow),
        localHigh: num(entry.localHigh),
        verdict:
          entry.verdict === "under" || entry.verdict === "over" || entry.verdict === "in_range"
            ? entry.verdict
            : "unknown",
        note: String(entry.note || ""),
        grounded: entry.grounded === true,
        provenance:
          entry.provenance === "verified" || entry.provenance === "ai_search"
            ? entry.provenance
            : "none",
        unitPrice: num(entry.unitPrice),
        quantity: num(entry.quantity) ?? 1,
        category: typeof entry.category === "string" ? entry.category : undefined,
        median: num(entry.median),
        average: num(entry.average),
        p25: num(entry.p25),
        p75: num(entry.p75),
        userPercentile: num(entry.userPercentile),
        differenceFromMedianPercent: num(entry.differenceFromMedianPercent),
        suggested:
          entry.suggested && typeof entry.suggested === "object"
            ? {
                competitive: Number((entry.suggested as Record<string, unknown>).competitive) || 0,
                market: Number((entry.suggested as Record<string, unknown>).market) || 0,
                premium: Number((entry.suggested as Record<string, unknown>).premium) || 0,
              }
            : null,
        comparableBakeries: num(entry.comparableBakeries) ?? 0,
        comparableProducts: num(entry.comparableProducts) ?? 0,
        shortfall: typeof entry.shortfall === "string" ? entry.shortfall : null,
        // every competitor row is one the baker can click through and check
        competitors: (Array.isArray(entry.competitors) ? entry.competitors : [])
          .slice(0, 12)
          .map((seller: Record<string, unknown>) => ({
            name: String(seller.name || ""),
            price: num(seller.price),
            uri: String(seller.uri || ""),
            sourceTitle: String(seller.sourceTitle || ""),
            product: typeof seller.product === "string" ? seller.product : "",
            quantity: num(seller.quantity),
            equivalentPrice: num(seller.equivalentPrice),
            unitPrice: num(seller.unitPrice),
            currency: typeof seller.currency === "string" ? seller.currency : null,
            distanceKm: num(seller.distanceKm),
            sourceType: typeof seller.sourceType === "string" ? seller.sourceType : "",
            confidence: num(seller.confidence) ?? 0,
            matchQuality: typeof seller.matchQuality === "string" ? seller.matchQuality : "",
            matchScore: num(seller.matchScore) ?? 0,
            matchReason: typeof seller.matchReason === "string" ? seller.matchReason : "",
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
