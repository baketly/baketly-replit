// What comparable bakes cost near the baker.
//
// The check used to be a pair of model calls: one that searched the web and
// wrote a note, one that turned the note into JSON. Every number in it — which
// shops, which products, which prices, what the range was — came out of a
// model, and there was no way to tell a read price from a remembered one.
//
// It is now a pipeline (see lib/market): map providers find the bakeries, their
// own websites are read for products and prices, those products are matched to
// the baker's on what they are rather than what they are called, and the market
// is arithmetic over the prices that survived. The model is given the finished
// numbers and asked to explain them.
//
// The old grounded search is kept for products the pipeline found nothing for,
// and what it produces is labelled `ai_search` in the response so it can never
// be mistaken for a price read off a shop's own page.

import { json, Router, type IRouter, type NextFunction, type Request, type Response } from "express";
import {
  generateJson,
  GeminiProviderError,
  MissingGeminiKeyError,
} from "../lib/gemini";
import { nearbyBakeries } from "../lib/nearby-bakeries";
import { marketLogger } from "../lib/market/log";
import { runPriceCheck } from "../lib/market/pipeline";
import type { ProductComparison } from "../lib/market/compare";

const router: IRouter = Router();

const MAX_PRODUCTS = 12;
const MAX_ACTIVE_CHECKS = 2;
const MAX_CHECKS_PER_WINDOW = 8;
const CHECK_WINDOW_MS = 60 * 60_000;

let activeChecks = 0;
const checkWindows = new Map<string, { count: number; resetsAt: number }>();

function admitCheck(req: Request, res: Response, next: NextFunction): void {
  const now = Date.now();
  if (checkWindows.size > 1_000) {
    for (const [id, window] of checkWindows) {
      if (window.resetsAt <= now) checkWindows.delete(id);
    }
  }
  const clientId = req.ip || "unknown";
  const window = checkWindows.get(clientId);
  if (!window || window.resetsAt <= now) {
    checkWindows.set(clientId, { count: 1, resetsAt: now + CHECK_WINDOW_MS });
  } else if (++window.count > MAX_CHECKS_PER_WINDOW) {
    res.status(429).json({ error: "Already checked recently. Try again later." });
    return;
  }
  if (activeChecks >= MAX_ACTIVE_CHECKS) {
    res.status(429).json({ error: "A price check is already running." });
    return;
  }
  activeChecks += 1;
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    activeChecks = Math.max(0, activeChecks - 1);
  };
  req.once("aborted", release);
  res.once("finish", release);
  res.once("close", release);
  next();
}

const CURRENCY_SYMBOLS: Record<string, string> = { USD: "$", EUR: "€", GBP: "£", ILS: "₪" };

/** The shape the app reads, built from the pipeline's own numbers. */
function productPayload(comparison: ProductComparison, note: string) {
  const stats = comparison.stats;
  return {
    name: comparison.name,
    price: comparison.price,
    unitPrice: comparison.unitPrice,
    quantity: comparison.reading.quantity ?? 1,
    category: comparison.reading.category,
    // where the numbers came from: read off shops' own pages
    provenance: stats ? ("verified" as const) : ("none" as const),
    grounded: !!stats,
    // the old field names the screen already knows
    localLow: stats ? stats.min : null,
    localHigh: stats ? stats.max : null,
    verdict: stats
      ? comparison.price < stats.p25
        ? "under"
        : comparison.price > stats.p75
          ? "over"
          : "in_range"
      : "unknown",
    note,
    median: stats ? stats.median : null,
    average: stats ? stats.average : null,
    p25: stats ? stats.p25 : null,
    p75: stats ? stats.p75 : null,
    userPercentile: stats ? stats.userPercentile : null,
    differenceFromMedianPercent: stats ? stats.differenceFromMedianPercent : null,
    suggested: stats ? stats.suggested : null,
    comparableBakeries: stats ? stats.comparableBakeries : 0,
    comparableProducts: stats ? stats.comparableProducts : 0,
    shortfall: comparison.shortfall,
    competitors: comparison.comparables.map((entry) => ({
      // the shop
      name: entry.bakery.name,
      distanceKm: entry.bakery.distanceKm,
      // what it sells
      product: entry.product.name,
      price: entry.product.price,
      quantity: entry.product.quantity,
      equivalentPrice: entry.equivalentPrice,
      unitPrice: entry.unitPrice,
      currency: entry.product.currency,
      // and where that came from
      uri: entry.product.sourceUrl,
      sourceTitle: entry.bakery.name,
      sourceType: entry.product.sourceType,
      confidence: entry.product.confidence,
      matchQuality: entry.match.matchQuality,
      matchScore: entry.match.matchScore,
      matchReason: entry.match.reasons.slice(0, 3).join(", "),
    })),
  };
}

// ---------------------------------------------------------------------------
// The old grounded search, kept for products the pipeline could not price.
// Its results are labelled and never mixed into the calculated market.
// ---------------------------------------------------------------------------

const searchSchema = {
  type: "OBJECT",
  properties: {
    products: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" },
          localLow: { type: "NUMBER", nullable: true },
          localHigh: { type: "NUMBER", nullable: true },
          note: { type: "STRING" },
          competitors: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                name: { type: "STRING" },
                price: { type: "NUMBER", nullable: true },
                sourceIndex: { type: "INTEGER" },
              },
              required: ["name", "price", "sourceIndex"],
            },
          },
        },
        required: ["name", "localLow", "localHigh", "note", "competitors"],
      },
    },
    currency: { type: "STRING" },
  },
  required: ["products", "currency"],
} as const;

const RESEARCH_RULES = [
  "You research what small bakeries and cafes currently charge, so a home baker can tell whether their own prices are out of step locally.",
  "Always search. Never answer from memory: prices you remember are out of date, and local prices are not something you can recall.",
  "SEARCH LIKE A PERSON WOULD. For each kind of product, run several searches — the plain question first, such as 'sourdough loaf price bakery near <town>', then the neighbouring towns by name, 'menu', 'order online', the local delivery apps, and the same again in the local language.",
  "GATHER AS MANY SELLERS AS YOU CAN. For each product, find prices at several different bakeries — three or more wherever they exist.",
  "MATCH THE KIND, NOT THE NAME. Work out what kind of thing each product is — a babka, a filled cookie, a sourdough loaf — and price the ordinary local version of that.",
  "STAY LOCAL. Every seller must be in the same country as the baker and within roughly an hour of the town given. If a source will not tell you which town the seller is in, do not use it.",
  "REPORT EVERY SELLER SEPARATELY: the product, the kind you priced, the seller's name, its town, the price with its currency, and where you found it.",
  "Never invent a number to fill a gap. If a product has no local price after real searching, say so plainly for that product.",
].join(" ");

const STRUCTURE_RULES = [
  "You convert a price research note into JSON. Use only numbers that appear in the note.",
  "For a product the note found nothing for, set localLow and localHigh to null and leave competitors empty.",
  "competitors lists the named sellers the note mentions for that product — up to six — each with the price the note gives, or null.",
  "localLow and localHigh are the lowest and highest prices the note lists for that product. With one seller, both are that price.",
  "sourceIndex is the number of the source that seller came from, from the numbered source list. Use -1 when it cannot be traced.",
  "The note field is one short plain sentence naming the range. No markdown, no URLs.",
  "currency is the ISO code of the local prices.",
].join(" ");

interface SearchFallbackProduct {
  name: string;
  localLow: number | null;
  localHigh: number | null;
  note: string;
  competitors: Array<{ name: string; price: number | null; uri: string; sourceTitle: string }>;
}

async function searchFallback(
  apiKey: string,
  location: string,
  products: Array<{ name: string; price: number }>,
  log: ReturnType<typeof marketLogger>,
): Promise<{ products: SearchFallbackProduct[]; currency: string; sources: Array<{ title: string; uri: string }>; searches: string[] }> {
  const neighbours = await nearbyBakeries(location);
  const lines = [
    "The baker sells in: " + location,
    "Every price you report must come from a seller in or near that place, in the same country.",
  ];
  if (neighbours.length) {
    lines.push("", "Bakeries near them, from map data, nearest first:");
    for (const shop of neighbours) {
      const where = [shop.town, shop.website].filter(Boolean).join(" · ");
      lines.push("- " + shop.name + " (" + shop.km + " km" + (where ? ", " + where : "") + ")");
    }
  }
  lines.push("", "Their products and current prices:");
  for (const product of products) lines.push("- " + product.name + ": " + product.price);
  const block = lines.join("\n");

  const research = await generateJson({
    apiKey,
    parts: [{ text: RESEARCH_RULES + "\n\n" + block }],
    tools: [{ google_search: {} }],
    temperature: 0.3,
    maxOutputTokens: 8192,
    attemptTimeoutMs: 30_000,
    budgetMs: 45_000,
  });
  const { sources, searches } = research;
  if (searches.length === 0 || sources.length === 0) {
    return { products: [], currency: "", sources: [], searches: [] };
  }

  const sourceList = sources.map((entry, index) => index + ". " + (entry.title || entry.uri)).join("\n");
  const { text } = await generateJson({
    apiKey,
    parts: [
      {
        text:
          STRUCTURE_RULES +
          "\n\n" +
          block +
          "\n\nNumbered sources:\n" +
          (sourceList || "(none)") +
          "\n\nResearch note:\n" +
          research.text,
      },
    ],
    responseSchema: searchSchema,
    temperature: 0,
    maxOutputTokens: 4096,
    attemptTimeoutMs: 20_000,
    budgetMs: 30_000,
  });

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { products: [], currency: "", sources: [], searches: [] };
  }

  const cleaned: SearchFallbackProduct[] = [];
  for (const entry of Array.isArray(parsed.products) ? parsed.products : []) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const low = Number(row.localLow);
    const high = Number(row.localHigh);
    if (!Number.isFinite(low) || !Number.isFinite(high)) continue;
    const competitors = (Array.isArray(row.competitors) ? row.competitors : [])
      .filter((value): value is Record<string, unknown> => !!value && typeof value === "object")
      .slice(0, 6)
      .map((seller) => {
        const index = Number(seller.sourceIndex);
        // the URL comes from grounding metadata, never from the model's prose
        const source =
          Number.isInteger(index) && index >= 0 && index < sources.length ? sources[index] : null;
        const price = Number(seller.price);
        return {
          name: typeof seller.name === "string" ? seller.name.trim().slice(0, 80) : "",
          price: Number.isFinite(price) && price > 0 ? Math.round(price * 100) / 100 : null,
          uri: source ? source.uri.slice(0, 400) : "",
          sourceTitle: source ? source.title.slice(0, 120) : "",
        };
      })
      .filter((seller) => seller.name && seller.uri);

    cleaned.push({
      name: typeof row.name === "string" ? row.name.slice(0, 120) : "Product",
      localLow: Math.round(low * 100) / 100,
      localHigh: Math.round(high * 100) / 100,
      note: typeof row.note === "string" ? row.note.trim().slice(0, 240) : "",
      competitors,
    });
  }

  log.event("SEARCH_FALLBACK_USED", { count: cleaned.length, searches: searches.length });
  return {
    products: cleaned,
    currency: typeof parsed.currency === "string" ? parsed.currency.slice(0, 8) : "",
    sources: sources.slice(0, 8).map((entry) => ({
      title: entry.title.slice(0, 120),
      uri: entry.uri.slice(0, 400),
    })),
    searches: searches.slice(0, 6).map((entry) => entry.slice(0, 120)),
  };
}

router.post(
  "/market-check",
  admitCheck,
  json({ limit: "32kb" }),
  async (req: Request, res: Response) => {
    const log = marketLogger(req.log);
    try {
      const body = req.body as { location?: unknown; products?: unknown; currency?: unknown };
      const location =
        typeof body.location === "string" ? body.location.trim().slice(0, 160) : "";
      if (!location) {
        res.status(400).json({
          error: "Add where you sell in Settings so Baketly can compare local prices.",
        });
        return;
      }
      const products = Array.isArray(body.products)
        ? body.products
            .filter(
              (entry): entry is { name: string; price: number } =>
                !!entry &&
                typeof entry === "object" &&
                typeof (entry as { name?: unknown }).name === "string" &&
                Number.isFinite(Number((entry as { price?: unknown }).price)),
            )
            .slice(0, MAX_PRODUCTS)
            .map((entry) => ({
              name: entry.name.trim().slice(0, 120),
              price: Number(entry.price),
            }))
        : [];
      if (products.length === 0) {
        res.status(400).json({ error: "Add a recipe with a price first." });
        return;
      }

      const currencyCode =
        typeof body.currency === "string" && /^[A-Z]{3}$/.test(body.currency) ? body.currency : "USD";
      const geminiApiKey = process.env.GEMINI_API_KEY || null;

      const result = await runPriceCheck({
        location,
        products,
        currency: currencyCode,
        geminiApiKey,
        log,
        budgetMs: 120_000,
      });

      const payload = result.comparisons.map((comparison) =>
        productPayload(comparison, result.noteFor(comparison)),
      );

      // ---- anything the pipeline could not price ---------------------------
      const unpriced = result.comparisons.filter((comparison) => !comparison.stats);
      let fallbackSources: Array<{ title: string; uri: string }> = [];
      let fallbackSearches: string[] = [];
      let fallbackCurrency = "";
      if (unpriced.length > 0 && geminiApiKey) {
        try {
          const fallback = await searchFallback(
            geminiApiKey,
            location,
            unpriced.map((comparison) => ({ name: comparison.name, price: comparison.price })),
            log,
          );
          fallbackCurrency = fallback.currency;
          fallbackSources = fallback.sources;
          fallbackSearches = fallback.searches;
          for (const found of fallback.products) {
            const row = payload.find((entry) => entry.name === found.name);
            if (!row || row.provenance === "verified") continue;
            // labelled, and kept out of every calculated field
            row.provenance = "ai_search" as never;
            row.localLow = found.localLow;
            row.localHigh = found.localHigh;
            row.note = found.note;
            row.verdict =
              found.localLow !== null && row.price < found.localLow
                ? "under"
                : found.localHigh !== null && row.price > found.localHigh
                  ? "over"
                  : "in_range";
            row.competitors = found.competitors.map((seller) => ({
              name: seller.name,
              distanceKm: null,
              product: "",
              price: seller.price,
              quantity: null,
              equivalentPrice: seller.price ?? 0,
              unitPrice: seller.price ?? 0,
              currency: fallback.currency || null,
              uri: seller.uri,
              sourceTitle: seller.sourceTitle,
              sourceType: "ai_search_fallback",
              confidence: 0.3,
              matchQuality: "low",
              matchScore: 0,
              matchReason: "found by search, not read from the shop's own page",
            })) as never;
          }
        } catch (error) {
          log.event("SEARCH_FALLBACK_USED", {
            count: 0,
            reason: error instanceof Error ? error.message : "fallback failed",
          });
        }
      }

      const verified = payload.filter((entry) => entry.provenance === "verified").length;
      req.log.info(
        {
          checkId: log.checkId,
          bakeries: result.bakeries.length,
          scanned: result.scannedBakeries,
          withProducts: result.bakeriesWithProducts,
          competitorProducts: result.competitorProducts,
          verifiedProducts: verified,
          fallbackProducts: payload.length - verified,
        },
        "Market check completed",
      );

      res.json({
        checkId: log.checkId,
        checkedAt: new Date().toISOString(),
        location,
        currency: CURRENCY_SYMBOLS[currencyCode] ? currencyCode : fallbackCurrency || currencyCode,
        summary: result.explanation.summary,
        products: payload,
        bakeriesFound: result.bakeries.length,
        bakeriesScanned: result.scannedBakeries,
        bakeriesWithProducts: result.bakeriesWithProducts,
        competitorProducts: result.competitorProducts,
        // shops we could not price, for the baker to look at themselves
        unread: result.unread.slice(0, 12).map((bakery) => ({
          name: bakery.name.slice(0, 80),
          website: bakery.website.slice(0, 300),
          distanceKm: bakery.distanceKm,
          reason: bakery.reason.slice(0, 120),
        })),
        sources: fallbackSources,
        searches: fallbackSearches,
      });
    } catch (error) {
      if (error instanceof MissingGeminiKeyError) {
        res.status(503).json({ error: "Local price checks are not configured yet." });
        return;
      }
      if (error instanceof GeminiProviderError) {
        req.log.warn(
          { checkId: log.checkId, providerStatus: error.status, providerMessage: error.message },
          "Market check failed",
        );
      } else {
        req.log.warn({ checkId: log.checkId, err: error }, "Market check failed");
      }
      res.status(502).json({ error: "Couldn't check local prices right now. Try again later." });
    }
  },
);

export default router;
