// Ask Baketly: the baker's own numbers, in plain language.
//
// This used to be one prompt. The browser assembled a snapshot of the whole
// bakery, posted it up with the question, and Gemini did the arithmetic and
// the answering at once. That made the model the database and the calculator,
// which is what it is worst at: it compared numbers wrongly, carried figures
// between months, and there was no way to tell a read number from a guessed
// one.
//
// Now the model is given tools instead of data. It works out what it needs to
// know, the server looks that up and calculates it from the signed-in baker's
// records, and the model explains what came back. The workspace never leaves
// the server, the numbers are never the model's, and every answer can say
// which records it rests on.

import { json, Router, type IRouter, type NextFunction, type Request, type Response } from "express";
import {
  converseWithTools,
  GeminiProviderError,
  MissingGeminiKeyError,
} from "../lib/gemini";
import { actionDeclarations, isAction, runAction, type Proposal } from "../lib/ask/actions";
import { askLogger } from "../lib/ask/log";
import { runTool, toolDeclarations } from "../lib/ask/registry";
import { suggestedQuestions } from "../lib/ask/suggestions";
import { loadWorkspace, workspaceIsEmpty } from "../lib/ask/workspace";
import type { SourceKind } from "../lib/ask/tools";
import { requireUser } from "../lib/session";

const router: IRouter = Router();

const MAX_QUESTION_CHARS = 500;
const MAX_HISTORY_TURNS = 8;
const MAX_ACTIVE_ASKS = 3;
const MAX_ASKS_PER_WINDOW = 30;
const ASK_WINDOW_MS = 10 * 60_000;

let activeAsks = 0;
const askWindows = new Map<string, { count: number; resetsAt: number }>();

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

const SYSTEM_RULES = [
  "You are Baketly, talking to one home baker about their own bakery. Your promise is their numbers, in plain language.",
  "You cannot see their records. Everything you say about their bakery must come from a tool you called in this conversation. Call a tool before answering any question about their products, sales, markets, costs or prices.",
  "Never do arithmetic the tools have already done, and never adjust a figure they returned. If a tool gives a median of 23, the median is 23.",
  "Two different figures, never to be mixed: what a product actually kept on the sales that happened, which the tools call recordedProfit, and what it would keep if baked at today's costs, which they call profitPerUnitAtTodaysCost. Ingredient prices move, so these disagree. When you talk about what a product has earned, use the recorded figures.",
  "Only say a product loses money, or is sold below cost, when a tool says sellingBelowCostToday is true for it, and then say it is about baking it now at today's costs rather than about sales already made. Never conclude it from comparing two numbers yourself.",
  "Never invent a number, a product, a market or a date. If a tool says something is unavailable, say so plainly and say what would record it — running a local price check, entering an hourly rate, saving a market's results.",
  "When a tool reports that more than one product or market matches, ask which one they meant. One short question, then stop.",
  "Separate what is recorded from what you think. A figure from a tool is a fact. A suggestion of what to do next is your opinion, and should sound like one: 'I'd try', 'it may be worth'. Never present advice as something their records show.",
  // The reason a home baker underprices is that their own hours are free.
  // Quoting a 91% margin without saying it excludes their time tells them the
  // opposite of what Baketly exists to tell them.
  "A margin that does not count their time is not what they earn. Whenever a tool says labourCosted is false for something whose margin or profit you are quoting, say in the same breath that it counts ingredients and packaging only, not their hours. Never call such a figure strong, healthy or good.",
  // Telling a baker to set an hourly rate they set last month sends them
  // looking for a setting they have already changed.
  // Left to itself the model repeated the field back — "that margin is
  // missing minutes, which goes on the recipe" — which is the tool's
  // vocabulary, not a sentence anyone says.
  // hourlyRateSet was the only labour signal on the bakery-wide tool, and a
  // rate with no batch times counts nothing — so an answer said a whole
  // month's margin "does count your time because your hourly rate is set".
  "For a figure about the whole bakery rather than one product, their time is counted only when labourCountedEverywhere is true. A set hourly rate is not enough on its own: if productsMissingBatchTime is above zero, say how many of their recipes still need the minutes a batch takes, and never tell them their time is in that number. Quote that count only when a tool in this conversation actually returned it — the per-product tools do not, and a question about one loaf never gets a count of recipes. Guessing it produced '12 of your recipes still need how long a batch takes' for a baker with one recipe.",
  "Name the one thing that would make that figure real, reading labourMissing rather than guessing, and say it as a person would. When it is 'rate', they have not set what an hour of their time is worth, and that is in Settings. When it is 'minutes', their hourly rate is already set and what is missing is how long a batch takes them, which goes on the recipe — never tell them to set a rate in this case. When it is 'both', say both. Never repeat a field name back to them, or a paraphrase of one: not labourMissing, not 'labour is not counted everywhere', not 'costed'. The words for this are their hours, their time, and how long a batch takes — and where some recipes have it and others do not, say how many still need it.",
  // A high margin is a fact about the past, not an argument about the future.
  "A high margin is not a reason to raise a price, and a low one is not a reason to raise it either. If you suggest changing a price, the reason has to be something other than the margin itself: what bakeries nearby charge, what sold out, what came home unsold, or how many of their hours it takes.",
  // Given that list, it reached for reasons it had no data for — "your
  // neighbours are charging more and you sold out last time" to a baker with
  // no price check and no markets at all. A made-up reason is worse than a
  // made-up number, because it sounds like something they told you.
  "Every one of those reasons has to come from a tool that returned it in this conversation. If no local price check has been run, you do not know what anyone nearby charges, and you must not say or imply that they charge more or less. If no market results are recorded, you do not know what sold out or what came home. When none of the reasons are available, say that — there is nothing yet that says the price is wrong — and leave it alone.",
  // A baker's first questions are about their setup, not their numbers, and
  // the answer to those is worked out by getNextStep rather than reasoned
  // about — one rung of a ladder, with the reason it comes next.
  "When they ask what to do next, how to get started, what is missing or why you cannot tell them something, call getNextStep and give them that one thing and the reason for it, in your own words. One thing, not a list: the ladder has already decided what comes first.",
  "Answer in two or three short sentences, the way you would say it to someone standing at their oven. No headings, no bullet points, no markdown, no field names from the tools, no consultant language.",
  "When there is a decision in it, say what you would do and why, in one sentence, after the numbers.",
  // The caveat about their hours kept eating the answer: asked whether a price
  // was right, it reported the price, warned that time was not counted, and
  // suggested recording the time — never saying whether the price was right.
  "Answer the question they asked before anything else. Asked whether a price is right, say whether you would change it and to what. Asked whether something is worth doing, say yes or no. The note about their time being uncounted is one clause inside that answer, never a substitute for it and never the thing you leave them with when they asked something else.",
  "Money is written like $12.99, in the currency the tools return. Percentages are whole numbers written with the sign, 92%, never spelled out.",
  "Keep the thread of the conversation. A question with no subject in it — 'why', 'which products', 'what about profit', 'would you do it again' — is about whatever the last answer was about. You are told below what you last looked at: call the same tool with the same market or product before answering, rather than starting again with a general one.",
  "When you give advice about a future market, name the products and the quantities. 'Bake a few less' is not advice; 'bring 30 sourdough instead of 40, and 12 more cheddar loaves, which sold out' is.",
  // Asked "which product makes me the most money?" on a bakery with one recipe
  // and no sales, it answered "Sourdough makes you the most money, bringing in
  // $8.11 per unit" — money nobody has taken, about a competition of one.
  "Never say a product has made, earned or brought in money unless a sale of it is recorded. With nothing sold, the figure you have is what one would keep if they baked and sold it today, and the answer has to make that plain — something like 'you have not sold any yet, but at today's prices each one would keep $8.11'. Say it in your own words to them, as you, never repeating a phrase from these instructions back at them, and never about 'they' — you are talking to the baker.",
  "Some questions need a run of sales behind them before any answer is worth having: what sells best, what earns most, what to bake more of, whether a price is working, how a month compares. Fewer than about ten sales is not a pattern, it is a few afternoons: do not call anything a best seller, a trend or a favourite on that, however the question is phrased. When the tools show no sales, or fewer than ten, say plainly that there is not enough trading yet to tell — and say what would change that, which is recording a few more sales. Do not dress a single sale, or none, up as a finding.",
  // A baker will ask it anything, and a chatbot that answers everything
  // stops being the thing that knows their bakery.
  "If they ask something that is not about their bakery — the weather, general baking technique, their personal life, anything you have no record of — do not answer it. Say in one friendly line that you only know their own numbers, and invite them to ask something about the bakery instead.",
].join(" ");

// What the model may set up, when the app in front of the baker can show the
// cards. Only ever appended to the rules above for a client that said so.
const ACTION_RULES = [
  "You can set things up for the baker, but you never change anything yourself. The tools addTodo, createEvent, setProductPrice and setIngredientPrice each check a request against their records and prepare one exact change, which appears on their screen as a card for them to confirm. Nothing happens until they tap it.",
  "When they ask you to add, create, open, book, plan, change, set, raise, lower or update something, call the matching tool with exactly what they said -- their words for the product, not a recipe name you picked for them. Do not ask permission first -- the card is the permission. If what they said fits more than one recipe, or none exactly, the card asks them which with their own recipes as buttons: say in one short sentence that it is ready and they can pick below, and never ask which they meant or list their recipes yourself.",
  "Whenever the baker refers to something you cannot pin down to one thing -- which recipe, which market, which ingredient -- do not ask them in words. Call the tool with their words as they said them; the tool puts the question on the card with the possibilities as buttons, which is faster for them than typing an answer.",
  "Keep hold of what is already on their screen. When a card is waiting for their confirmation and their next message is about it -- 'call this market', 'make it 30 loaves', 'add a booth fee', 'actually Friday' -- change that card: call createEvent with amends set to the card's id and only what changes. Never open a second market for what is plainly the same one, and never ask again about lines they have already picked. A change to a market they saved earlier is updateEvent.",
  "After a tool has prepared a change, tell them in one short sentence what is waiting for their confirmation. Never say it is done, added, created, changed or updated, because it is not yet: 'I've set up tomorrow's market with 6 sourdough loaves -- confirm it below' is right; 'I've created the event' is wrong. If a tool refused, say why in their words and what would make it work.",
  "Dates are yours to work out from today's date given above: 'tomorrow', 'Friday', 'the 15th', 'next week'. Pass them to the tools as YYYY-MM-DD.",
  "A change is not advice. If they asked for a change, prepare it; if they asked what you think, say what you think and prepare nothing unless they then ask you to.",
].join(" ");

interface HistoryTurn {
  role: "user" | "model";
  text: string;
}

function readHistory(value: unknown): HistoryTurn[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (turn): turn is { who?: unknown; role?: unknown; text: string } =>
        !!turn && typeof turn === "object" && typeof (turn as { text?: unknown }).text === "string",
    )
    .map((turn) => ({
      role:
        turn.who === "u" || turn.role === "user" ? ("user" as const) : ("model" as const),
      text: String(turn.text).slice(0, 600),
    }))
    .slice(-MAX_HISTORY_TURNS);
}

/**
 * The subject of the last answer, written back into this one's prompt.
 *
 * Conversation history alone was not enough: asked "which products?" after an
 * answer about one market, the model reached for the whole bakery. Naming the
 * lookup it just made, with the market or product in it, is what keeps a
 * follow-up on the same thing.
 */
function previousLookups(value: unknown): string {
  if (!Array.isArray(value)) return "";
  const lines = value
    .filter(
      (entry): entry is { name: string; args?: unknown } =>
        !!entry && typeof entry === "object" && typeof (entry as { name?: unknown }).name === "string",
    )
    .slice(-3)
    .map((entry) => {
      const args =
        entry.args && typeof entry.args === "object"
          ? Object.entries(entry.args as Record<string, unknown>)
              .filter(([, argument]) => argument !== undefined && argument !== "")
              .map(([key, argument]) => key + ": " + JSON.stringify(argument).slice(0, 80))
              .join(", ")
          : "";
      return "- " + entry.name + (args ? " (" + args + ")" : "");
    });
  if (lines.length === 0) return "";
  return [
    "",
    "Your last answer in this conversation came from these lookups. If the new question does not name its own subject, it is about the same thing:",
    ...lines,
  ].join("\n");
}

/**
 * The cards the app still shows, as the app sent them back: id, summary, and
 * the change with whatever the baker has picked so far. Only the shape is
 * checked -- an amend starts from this, so a card nobody could have drawn is
 * dropped rather than trusted.
 */
function readPending(value: unknown): Proposal[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (entry): entry is Proposal =>
        !!entry &&
        typeof entry === "object" &&
        typeof (entry as Proposal).id === "string" &&
        (entry as Proposal).id.length <= 80 &&
        typeof (entry as Proposal).summary === "string" &&
        !!(entry as Proposal).action &&
        typeof (entry as Proposal).action === "object" &&
        isAction(String((entry as Proposal).action.type)),
    )
    .slice(0, 4);
}

/** What is waiting on their screen, so a follow-up can be about it. */
function pendingCards(pending: Proposal[]): string {
  if (!pending.length) return "";
  const lines = pending.map((card) => {
    const action = card.action as { type: string; items?: Array<{ name: string; quantity: number }> };
    const lineup = Array.isArray(action.items) && action.items.length
      ? " -- lineup: " + action.items.map((item) => item.quantity + " x " + item.name).join(", ")
      : "";
    const open = Array.isArray(card.choices) && card.choices.length
      ? " (still being asked which recipe for: " + card.choices.map((choice) => choice.said).join(", ") + ")"
      : "";
    return "- " + action.type + " [id " + card.id + "]: " + card.summary + lineup + open;
  });
  return [
    "",
    "These changes are already prepared on the baker's screen, waiting for their confirmation. If the new message is about one of them -- it, this market, that one -- change it with amends set to its id rather than preparing another:",
    ...lines,
  ].join("\n");
}

router.get("/ask/suggestions", requireUser, async (req: Request, res: Response) => {
  try {
    const workspace = await loadWorkspace(req.user!.id);
    res.json({ suggestions: suggestedQuestions(workspace) });
  } catch (error) {
    req.log.warn({ err: error }, "Ask Baketly suggestions failed");
    res.json({ suggestions: [] });
  }
});

router.post(
  "/ask",
  requireUser,
  admitAsk,
  json({ limit: "16kb" }),
  async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const log = askLogger(req.log, userId);
    const startedAt = Date.now();

    try {
      const body = req.body as {
        question?: unknown;
        history?: unknown;
        lastTools?: unknown;
        canAct?: unknown;
        today?: unknown;
        pending?: unknown;
      };
      const question = typeof body.question === "string" ? body.question.trim() : "";
      // An app that can show a confirmation card says so; one that cannot is
      // never offered the tools that need it, so the model cannot promise a
      // card an old build has no way to draw.
      const canAct = body.canAct === true;
      // the cards still waiting on their screen, so "call this market base
      // market" changes the one they can see rather than opening another
      const pending = readPending(body.pending);
      // the baker's own date, from their phone: the server's midnight is not theirs
      const today =
        typeof body.today === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.today)
          ? body.today
          : new Date().toISOString().slice(0, 10);
      if (!question) {
        res.status(400).json({ error: "Ask a question first." });
        return;
      }
      if (question.length > MAX_QUESTION_CHARS) {
        res.status(400).json({ error: "That question is a bit long. Try shortening it." });
        return;
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) throw new MissingGeminiKeyError();

      // The workspace is read here, for this user, and handed only to the
      // tools. Nothing the browser sent decides whose bakery this is.
      const workspace = await loadWorkspace(userId);
      const history = readHistory(body.history);
      log.event("ASK_BAKETLY_REQUEST", {
        questionChars: question.length,
        historyTurns: history.length,
        empty: workspaceIsEmpty(workspace),
      });
      // A bakery with nothing in it is answered here rather than by the model.
      //
      // As a rule among twenty others it kept losing: asked what to charge for
      // bread, with no recipes, no sales and no markets, the model reached for
      // the price-check tool, found it unavailable, and answered about local
      // price checks — to someone whose actual problem is that Baketly has
      // never been told what they bake.
      //
      // There is exactly one true answer here and it needs no reasoning, so it
      // costs a model call to produce and can drift every time the prompt
      // changes. It is written down instead.
      if (workspaceIsEmpty(workspace)) {
        log.event("ASK_BAKETLY_EMPTY_WORKSPACE");
        res.json({
          answer:
            "There is nothing in your bakery yet, so there is nothing I can work out for you. " +
            "Baketly turns what you pay for ingredients into what each bake really costs. " +
            "Add your first recipe and what goes into it, and I can tell you what it costs to make and what to charge for it.",
          sources: [],
          suggestions: suggestedQuestions(workspace),
        });
        return;
      }

      const sources = new Map<string, { kind: SourceKind; detail: string }>();
      const toolsUsed: string[] = [];
      // What the previous answer was about, handed back by the chat. It is the
      // difference between "which products?" meaning "at Riverside Night
      // Market" and it meaning "in my whole bakery".
      const calledLast: Array<{ name: string; args: Record<string, unknown> }> = [];

      // changes the model prepared, handed back for the app to show as cards
      const proposals: Proposal[] = [];

      const conversation = await converseWithTools({
        apiKey,
        toolDeclarations: canAct ? [...toolDeclarations, ...actionDeclarations] : toolDeclarations,
        prompt: [
          SYSTEM_RULES,
          canAct ? ACTION_RULES : "",
          "",
          "Today is " + today + ".",
          workspace.bakeryName ? "Their bakery is called " + workspace.bakeryName + "." : "",
          previousLookups(body.lastTools),
          canAct ? pendingCards(pending) : "",
          "",
          "The baker asks: " + question,
        ]
          .filter(Boolean)
          .join("\n"),
        history,
        temperature: 0.3,
        maxOutputTokens: 1_024,
        attemptTimeoutMs: 22_000,
        budgetMs: 55_000,
        maxRounds: 4,
        runTool: async (call) => {
          log.event("ASK_BAKETLY_TOOL_REQUESTED", { tool: call.name });
          toolsUsed.push(call.name);
          calledLast.push({ name: call.name, args: call.args });
          // an action prepares a change and hands it to the app; it never
          // runs one, and it is only reachable when the app asked for it
          if (canAct && isAction(call.name)) {
            const prepared = runAction(workspace, call.name, call.args, today, pending);
            if (prepared.proposal) proposals.push(prepared.proposal);
            log.event(prepared.proposal ? "ASK_BAKETLY_TOOL_SUCCESS" : "ASK_BAKETLY_TOOL_REFUSED", {
              tool: call.name,
              reason: prepared.proposal ? undefined : String(prepared.result.problem || "refused"),
            });
            return prepared.result;
          }
          const outcome = runTool(workspace, call.name, call.args, log);
          for (const source of outcome.sources) {
            sources.set(source.kind + "|" + source.detail, source);
          }
          return outcome.result;
        },
        onModelSkipped: (model, error) =>
          log.event("ASK_BAKETLY_GEMINI_ERROR", {
            model,
            reason: error.message.slice(0, 160),
          }),
      });

      const answer = conversation.text.trim().slice(0, 1_200);
      if (!answer) throw new GeminiProviderError(502, "empty", "Gemini returned no answer");

      log.event("ASK_BAKETLY_RESPONSE", {
        ms: Date.now() - startedAt,
        model: conversation.model,
        rounds: conversation.rounds,
        tools: toolsUsed.join(","),
        answerChars: answer.length,
      });

      res.json({
        answer,
        // what the answer rests on, for the chips under it
        sources: [...sources.values()],
        toolsUsed,
        // handed back with the next question, so a follow-up keeps its subject
        lastTools: calledLast.slice(-3),
        followUps: suggestedQuestions(workspace),
        // changes prepared for the baker to confirm; empty for an app that
        // cannot show them, since it was never offered the tools
        actions: proposals,
        requestId: log.requestId,
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
        log.event("ASK_BAKETLY_GEMINI_ERROR", {
          reason: error.message.slice(0, 200),
          status: error.status,
          ms: Date.now() - startedAt,
        });
      } else {
        req.log.warn({ err: error, requestId: log.requestId }, "Ask Baketly failed");
      }
      res.status(502).json({
        error:
          "I couldn't answer that right now. Your numbers are still on the Analytics screen.",
      });
    }
  },
);

export default router;
