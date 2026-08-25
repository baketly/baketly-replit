import { json, Router, type IRouter, type NextFunction, type Request, type Response } from "express";
import {
  generateJson,
  GeminiProviderError,
  MissingGeminiKeyError,
} from "../lib/gemini";
import {
  buildTargetPlan,
  describePlan,
  findTarget,
  looksLikePlanning,
  type PlanProduct,
} from "../lib/plan";

const router: IRouter = Router();

const MAX_QUESTION_CHARS = 500;
const MAX_HISTORY_TURNS = 8;
const MAX_CONTEXT_BYTES = 24 * 1024;
const MAX_ACTIVE_ASKS = 3;
const MAX_ASKS_PER_WINDOW = 30;
const ASK_WINDOW_MS = 10 * 60_000;

let activeAsks = 0;
const askWindows = new Map<string, { count: number; resetsAt: number }>();

const answerSchema = {
  type: "OBJECT",
  properties: {
    answer: { type: "STRING" },
    wins: { type: "ARRAY", items: { type: "STRING" }, maxItems: 1 },
    followUps: { type: "ARRAY", items: { type: "STRING" } },
  },
  required: ["answer", "wins", "followUps"],
} as const;

// The whole point of the feature: every reply is grounded in this baker's own
// numbers, and every reply leaves them with something they had not asked about.
const SYSTEM_RULES = [
  "You are Baketly, an assistant for a home baker who sells what they bake.",
  "You are given a JSON snapshot of THIS baker's pantry, recipes, monthly sales and market events. Answer only from that snapshot and from arithmetic you do on it.",
  "Never invent a number. If the snapshot does not contain what is needed, say plainly what is missing and which screen would record it.",
  "bestSellers on a month, and bestSellersAllTime, are already worked out. When asked which product sold most, or earned most, take the answer from those fields rather than comparing the product lists yourself.",
  "Figures belong to the period they are filed under. Never carry a number from one month, or from the lifetime totals, and present it as another month. If a month in the question is not in the snapshot, say you do not have that month rather than answering with a different one.",
  "Quote the baker's real figures and names when you answer, so the reply is obviously about their bakery and not generic advice.",
  "productTotalsAllTime covers every sale on record and salesPeriod says which dates that spans; latestMonthProducts covers only the newest month. For a question with no period in it, such as a best seller, answer from the whole record and say what period that is. Use the monthly figures only when the baker asks about a month.",
  "Money is US dollars, written like $12.99. Percentages are whole numbers.",
  "Write plainly, as if to a smart person who does not use spreadsheets. Short sentences. No jargon, no headings, no markdown, no bullet characters.",
  "Never repeat a field name from the snapshot. Say margin, return, cost or revenue in plain words; never write marginPct, roiPct, unitCost or similar.",
  "TARGETS AND PLANS: when the baker asks how to reach an amount, or what to bake, do the work rather than remarking on whether the figure is realistic. Start from what is already planned if the snapshot has a lineup, work out the gap, then propose actual quantities of their own products and add them up to the target. Favour the ones that keep the most per unit and take the fewest ingredients, and say why those. Give the arithmetic in plain lines, one product per line, ending with the total. If the target is far above anything they have taken before, still give the plan, then say plainly what it would take compared with their best market so far.",
  "In a plan, add up the lines you actually wrote and state that sum, even if it does not land exactly on the target. Do not restate the target as the total. If the sum overshoots, either say so or reduce a quantity so it lands.",
  "Keep 'answer' under 90 words, except for a plan, which may run to 160 and may use one short line per product. Never use bullet characters, asterisks or markdown.",
  "'wins' holds AT MOST ONE finding the baker did NOT ask about: an underpriced product, a margin that slipped, an ingredient driving cost, a market that is not worth its costs, a product worth baking more of. Pick the single most useful one and name the real figure that makes it true. Return an empty list rather than a weak or unsupported finding.",
  "'followUps' holds up to three short questions the baker could ask next, phrased in their words, each answerable from the snapshot.",
  "GETTING STARTED: if the snapshot has no sales and no recipes, or the pantry is empty, the baker is new. Do not report findings about data that is not there. Instead explain, in their terms, what Baketly does for them: it turns what they pay for ingredients and packaging into the true cost of one bake, suggests a price that keeps a margin, reads a nutrition label from a photo, and tracks what each market actually kept after booth and travel costs. Say plainly which one thing to add first and where. Keep 'wins' empty, and make every entry in 'followUps' a question about learning or setting up the app rather than about numbers they do not have yet.",
] .join(" ");

function admitAsk(req: Request, res: Response, next: NextFunction): void {
  const now = Date.now();
  if (askWindows.size > 1_000) {
    for (const [clientId, window] of askWindows) {
      if (window.resetsAt <= now) askWindows.delete(clientId);
    }
  }
  const clientId = req.ip || "unknown";
  const window = askWindows.get(clientId);
  if (!window || window.resetsAt <= now) {
    askWindows.set(clientId, { count: 1, resetsAt: now + ASK_WINDOW_MS });
  } else if (++window.count > MAX_ASKS_PER_WINDOW) {
    res.status(429).json({
      error: "You've asked a lot in a short while. Try again in a few minutes.",
    });
    return;
  }
  if (activeAsks >= MAX_ACTIVE_ASKS) {
    res.status(429).json({ error: "Baketly is busy. Try again in a moment." });
    return;
  }
  activeAsks += 1;
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    activeAsks = Math.max(0, activeAsks - 1);
  };
  req.once("aborted", release);
  res.once("finish", release);
  res.once("close", release);
  next();
}

function cleanList(value: unknown, max: number, maxChars: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .slice(0, max)
    .map((entry) => entry.slice(0, maxChars));
}

router.post(
  "/ask",
  admitAsk,
  json({ limit: "64kb" }),
  async (req: Request, res: Response) => {
    try {
      const body = req.body as {
        question?: unknown;
        context?: unknown;
        history?: unknown;
      };

      const question =
        typeof body.question === "string" ? body.question.trim() : "";
      if (!question) {
        res.status(400).json({ error: "Ask a question first." });
        return;
      }
      if (question.length > MAX_QUESTION_CHARS) {
        res.status(400).json({ error: "That question is a bit long. Try shortening it." });
        return;
      }
      if (!body.context || typeof body.context !== "object") {
        res.status(400).json({ error: "Baketly could not read your bakery data." });
        return;
      }

      const contextText = JSON.stringify(body.context);
      if (contextText.length > MAX_CONTEXT_BYTES) {
        res.status(413).json({ error: "There is too much data to summarise at once." });
        return;
      }

      const history = Array.isArray(body.history)
        ? body.history
            .filter(
              (turn): turn is { who: string; text: string } =>
                !!turn &&
                typeof turn === "object" &&
                (turn as { who?: unknown }).who !== undefined &&
                typeof (turn as { text?: unknown }).text === "string",
            )
            .slice(-MAX_HISTORY_TURNS)
            .map(
              (turn) =>
                `${turn.who === "u" ? "Baker" : "Baketly"}: ${turn.text.slice(0, 400)}`,
            )
        : [];

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) throw new MissingGeminiKeyError();

      // Work a revenue target out here; the model's own sums were unreliable.
      const context = body.context as {
        recipes?: PlanProduct[];
        upcomingEvent?: { plannedLineup?: Array<{ name: string; quantity: number; price: number }> } | null;
      };
      const target = findTarget(question);
      const plan =
        target && looksLikePlanning(question)
          ? buildTargetPlan(
              target,
              Array.isArray(context.recipes) ? context.recipes : [],
              context.upcomingEvent?.plannedLineup ?? [],
            )
          : null;

      const prompt = [
        SYSTEM_RULES,
        "",
        "Bakery snapshot (JSON):",
        contextText,
        "",
        ...(plan
          ? [
              "A plan for the target in the question has already been worked out. Every number below is correct: use them exactly and never recalculate. But write the plan in your own plain sentences, the way you would say it out loud. Do not copy these labels, and never print words like Target, Gap to cover, Added or Chosen because. Say where the lineup stands, what it still needs, then one short line per product, then what the lineup comes to. Mention the overshoot only if there is one, and give the reason as a sentence.",
              describePlan(plan),
              "",
            ]
          : []),
        ...(history.length ? ["Earlier in this conversation:", ...history, ""] : []),
        `The baker asks: ${question}`,
      ].join("\n");

      const { text, model } = await generateJson({
        apiKey,
        parts: [{ text: prompt }],
        responseSchema: answerSchema,
        temperature: 0.4,
        maxOutputTokens: 2048,
        attemptTimeoutMs: 22_000,
        budgetMs: 48_000,
        onModelSkipped: (skipped, error) =>
          req.log.warn(
            {
              model: skipped,
              providerStatus: error.status,
              providerCode: error.providerCode,
              providerMessage: error.message,
            },
            "Ask Baketly model unavailable, trying the next one",
          ),
      });

      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new GeminiProviderError(502, "unparsable", "Gemini returned malformed JSON");
      }
      const source = parsed as Record<string, unknown>;
      const answer =
        typeof source.answer === "string" ? source.answer.trim().slice(0, 1_500) : "";
      if (!answer) {
        throw new GeminiProviderError(502, "empty", "Gemini returned no answer");
      }

      req.log.info({ model }, "Ask Baketly answered");
      res.json({
        answer,
        wins: cleanList(source.wins, 1, 240),
        followUps: cleanList(source.followUps, 3, 120),
      });
    } catch (error) {
      if (error instanceof MissingGeminiKeyError) {
        res.status(503).json({
          error:
            "Ask Baketly is not configured yet. Your numbers are still on the Analytics screen.",
        });
        return;
      }
      if (error instanceof GeminiProviderError) {
        req.log.warn(
          {
            providerStatus: error.status,
            providerCode: error.providerCode,
            providerMessage: error.message,
          },
          "Ask Baketly request failed",
        );
      } else {
        req.log.warn({ err: error }, "Ask Baketly failed");
      }
      res.status(502).json({
        error:
          "I couldn't answer that right now. Your numbers are still on the Analytics screen.",
      });
    }
  },
);

export default router;
