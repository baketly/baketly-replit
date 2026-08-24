import { json, Router, type IRouter, type NextFunction, type Request, type Response } from "express";
import {
  generateJson,
  GeminiProviderError,
  MissingGeminiKeyError,
} from "../lib/gemini";

const router: IRouter = Router();

const MAX_PRODUCTS = 12;
const MAX_ACTIVE_CHECKS = 2;
const MAX_CHECKS_PER_WINDOW = 8;
const CHECK_WINDOW_MS = 60 * 60_000;

let activeChecks = 0;
const checkWindows = new Map<string, { count: number; resetsAt: number }>();

const marketSchema = {
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
          verdict: { type: "STRING", enum: ["under", "in_range", "over", "unknown"] },
          note: { type: "STRING" },
          grounded: { type: "BOOLEAN" },
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
        required: ["name", "localLow", "localHigh", "verdict", "note", "grounded", "competitors"],
      },
    },
    currency: { type: "STRING" },
    summary: { type: "STRING" },
  },
  required: ["products", "currency", "summary"],
} as const;

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

// Two passes on purpose. Asking for JSON suppresses the search tool, so the
// model answers pricing questions from memory and invents plausible ranges.
// Pass one runs schema-free and actually searches; pass two only reshapes what
// pass one found, with no tools, so no new number can appear.
const RESEARCH_RULES = [
  "You research what small bakeries and cafes currently charge, so a home baker can tell whether their own prices are out of step locally.",
  "Always use the search tool before you answer. Run at least one search per product, using the local language of the given location as well as English. Never answer from memory: prices you remember are out of date and location-specific prices are not something you can recall.",
  "Search the web for CURRENT prices for each product listed, in or near the given location. Prefer bakery menus, delivery apps and local listings.",
  "For each product write one line: the product name, the local price range you actually found with its currency, and the bakery or site it came from.",
  "If you could not find real local prices for a product, write that you found none for it. Never guess a number to fill a gap: the baker will change their prices based on this, so an honest 'not found' is worth more than an invented range.",
].join(" ");

const STRUCTURE_RULES = [
  "You convert a price research note into JSON. Use only numbers that appear in the note.",
  "If the note names a real local range for a product, you MUST set localLow and localHigh to those numbers and set grounded to true. Never describe a range in the note field without also filling localLow and localHigh.",
  "For a product the note found nothing for, set localLow and localHigh to null, verdict to unknown, grounded to false, and leave competitors empty.",
  "competitors lists up to three named sellers the note actually mentions for that product, each with the price the note gives for that seller, or null if it gives none. Never invent a seller.",
  "sourceIndex is the number of the source that seller came from, taken from the numbered source list. Use -1 when the seller cannot be traced to one of those sources.",
  "verdict compares the baker's own price with the local range: 'under' if they charge less than the local low, 'over' if more than the local high, otherwise 'in_range'.",
  "The note field is one short plain sentence naming the local range and what it means for their price. No markdown, no bullets, no URLs.",
  "currency is the ISO code of the local prices, such as USD, ILS or EUR.",
  "summary is one sentence covering the whole check.",
].join(" ");

router.post(
  "/market-check",
  admitCheck,
  json({ limit: "32kb" }),
  async (req: Request, res: Response) => {
    try {
      const body = req.body as { location?: unknown; products?: unknown };
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

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) throw new MissingGeminiKeyError();

      const lines = ["Where the baker sells: " + location, "Their products and current prices:"];
      for (const product of products) {
        lines.push("- " + product.name + ": " + product.price);
      }
      const productBlock = lines.join("\n");

      const research = await generateJson({
        apiKey,
        parts: [{ text: RESEARCH_RULES + "\n\n" + productBlock }],
        tools: [{ google_search: {} }],
        temperature: 0,
        maxOutputTokens: 2048,
        attemptTimeoutMs: 30_000,
        budgetMs: 45_000,
        onModelSkipped: (skipped, error) =>
          req.log.warn(
            { model: skipped, providerStatus: error.status, providerMessage: error.message },
            "Market research model unavailable, trying the next one",
          ),
      });
      const { sources, searches } = research;

      const sourceList = sources
        .map((entry, index) => index + ". " + (entry.title || entry.uri))
        .join(String.fromCharCode(10));

      const { text, model } = await generateJson({
        apiKey,
        parts: [
          {
            text:
              STRUCTURE_RULES +
              "\n\n" +
              productBlock +
              "\n\nNumbered sources:\n" +
              (sourceList || "(none)") +
              "\n\nResearch note:\n" +
              research.text,
          },
        ],
        responseSchema: marketSchema,
        temperature: 0,
        maxOutputTokens: 4096,
        attemptTimeoutMs: 20_000,
        budgetMs: 30_000,
      });

      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new GeminiProviderError(502, "unparsable", "Market check returned malformed JSON");
      }
      const source = parsed as Record<string, unknown>;
      const rawProducts = Array.isArray(source.products) ? source.products : [];

      // If the API performed no searches, nothing here is grounded regardless of
      // what the model says about itself.
      const anySearch = searches.length > 0 && sources.length > 0;

      const cleaned = rawProducts
        .filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === "object")
        .slice(0, MAX_PRODUCTS)
        .map((entry) => {
          const low = Number(entry.localLow);
          const high = Number(entry.localHigh);
          const hasRange =
            anySearch && entry.grounded === true && Number.isFinite(low) && Number.isFinite(high);
          // The model chooses which source a seller came from; the URL itself
          // comes from grounding metadata, so a link can never be invented.
          const competitors = (Array.isArray(entry.competitors) ? entry.competitors : [])
            .filter((c): c is Record<string, unknown> => !!c && typeof c === "object")
            .slice(0, 3)
            .map((c) => {
              const index = Number(c.sourceIndex);
              const source =
                Number.isInteger(index) && index >= 0 && index < sources.length
                  ? sources[index]
                  : null;
              const price = Number(c.price);
              return {
                name: typeof c.name === "string" ? c.name.trim().slice(0, 80) : "",
                price: Number.isFinite(price) && price > 0 ? Math.round(price * 100) / 100 : null,
                uri: source ? source.uri.slice(0, 400) : "",
                sourceTitle: source ? source.title.slice(0, 120) : "",
              };
            })
            .filter((c) => c.name.length > 0 && c.uri.length > 0);

          return {
            competitors: hasRange ? competitors : [],
            name: typeof entry.name === "string" ? entry.name.slice(0, 120) : "Product",
            localLow: hasRange ? Math.round(low * 100) / 100 : null,
            localHigh: hasRange ? Math.round(high * 100) / 100 : null,
            verdict: hasRange && typeof entry.verdict === "string" ? entry.verdict : "unknown",
            // never let prose describe a range the data does not carry
            note: hasRange && typeof entry.note === "string"
              ? entry.note.trim().slice(0, 240)
              : "No local prices found for this one.",
            grounded: hasRange,
          };
        });

      req.log.info(
        { model, searches: searches.length, sources: sources.length },
        "Market check completed",
      );
      res.json({
        checkedAt: new Date().toISOString(),
        location,
        currency: typeof source.currency === "string" ? source.currency.slice(0, 8) : "",
        summary: typeof source.summary === "string" ? source.summary.slice(0, 400) : "",
        products: cleaned,
        sources: sources.slice(0, 8).map((entry) => ({
          title: entry.title.slice(0, 120),
          uri: entry.uri.slice(0, 400),
        })),
        searches: searches.slice(0, 6).map((entry) => entry.slice(0, 120)),
      });
    } catch (error) {
      if (error instanceof MissingGeminiKeyError) {
        res.status(503).json({ error: "Local price checks are not configured yet." });
        return;
      }
      if (error instanceof GeminiProviderError) {
        req.log.warn(
          { providerStatus: error.status, providerMessage: error.message },
          "Market check failed",
        );
      } else {
        req.log.warn({ err: error }, "Market check failed");
      }
      res.status(502).json({ error: "Couldn't check local prices right now. Try again later." });
    }
  },
);

export default router;
