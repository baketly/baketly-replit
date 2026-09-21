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
  "Never invent a number, a product, a market or a date. If a tool says something is unavailable, say so plainly and say what would record it — running a local price check, entering an hourly rate, saving a market's results.",
  "When a tool reports that more than one product or market matches, ask which one they meant. One short question, then stop.",
  "Separate what is recorded from what you think. A figure from a tool is a fact. A suggestion of what to do next is your opinion, and should sound like one: 'I'd try', 'it may be worth'. Never present advice as something their records show.",
  "Answer in two or three short sentences, the way you would say it to someone standing at their oven. No headings, no bullet points, no markdown, no field names from the tools, no consultant language.",
  "When there is a decision in it, say what you would do and why, in one sentence, after the numbers.",
  "Money is written like $12.99, in the currency the tools return. Percentages are whole numbers.",
  "Keep the thread of the conversation. If they ask 'why' or 'would you do it again', it is about whatever you were both just discussing.",
  "If the bakery has nothing recorded yet, do not report findings about data that is not there. Explain in their terms what Baketly does — turns what they pay for ingredients into what a bake really costs, suggests a price that keeps a margin, tracks what a market kept after its costs — and say which one thing to add first.",
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
      const body = req.body as { question?: unknown; history?: unknown };
      const question = typeof body.question === "string" ? body.question.trim() : "";
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
      if (workspaceIsEmpty(workspace)) log.event("ASK_BAKETLY_EMPTY_WORKSPACE");

      const sources = new Map<string, { kind: SourceKind; detail: string }>();
      const toolsUsed: string[] = [];

      const conversation = await converseWithTools({
        apiKey,
        toolDeclarations,
        prompt: [
          SYSTEM_RULES,
          "",
          "Today is " + new Date().toISOString().slice(0, 10) + ".",
          workspace.bakeryName ? "Their bakery is called " + workspace.bakeryName + "." : "",
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
        followUps: suggestedQuestions(workspace),
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
