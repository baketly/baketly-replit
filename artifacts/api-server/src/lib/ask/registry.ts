// The tools, as the model sees them, and the only way it can run one.
//
// Two jobs. The declarations tell Gemini what exists and what each one takes;
// the dispatcher runs the named tool against the workspace it was handed — the
// signed-in baker's, always, since no declaration accepts a user or workspace
// id and the dispatcher would ignore one if it did.
//
// Everything here reads. Nothing changes a price, a recipe, an event or a
// sale: that is version one on purpose, so an assistant that misunderstands a
// question can only ever be wrong out loud.

import type { AskLogger } from "./log";
import { getMarketPricing } from "./market-tool";
import {
  analyzeProductPrice,
  compareEvents,
  compareProducts,
  getBakerySummary,
  getEventDetails,
  getEventRecommendations,
  getProductDetails,
  getSalesTrends,
  type SourceKind,
  type ToolOutcome,
} from "./tools";
import type { Workspace } from "./workspace";

const PERIOD_VALUES = [
  "today",
  "this_week",
  "last_week",
  "this_month",
  "last_month",
  "last_30_days",
  "last_90_days",
  "this_year",
  "all_time",
];

const periodProperty = {
  type: "STRING",
  enum: PERIOD_VALUES,
  description:
    "Which period to cover. Leave out to use the tool's sensible default. Never guess dates yourself.",
};

/** What Gemini is told exists. */
export const toolDeclarations = [
  {
    name: "getBakerySummary",
    description:
      "How the bakery is doing overall in a period: revenue, costs, profit, margin, orders, best sellers, most profitable products and any markets in that time. Use for 'how am I doing', 'this month', general questions.",
    parameters: { type: "OBJECT", properties: { period: periodProperty } },
  },
  {
    name: "getProductDetails",
    description:
      "One product in full: price, ingredient, packaging and labour cost, cost per unit, profit per unit, margin, and how many sold. Use when the baker asks about one named product.",
    parameters: {
      type: "OBJECT",
      properties: {
        product: { type: "STRING", description: "The product's name as the baker says it." },
        period: periodProperty,
      },
      required: ["product"],
    },
  },
  {
    name: "compareProducts",
    description:
      "Compares products on revenue, units, cost, profit per unit, total profit and margin, and says which wins on each. Call with no products to rank everything the baker sells — use that for 'my most profitable product' or 'best margin'.",
    parameters: {
      type: "OBJECT",
      properties: {
        products: {
          type: "ARRAY",
          items: { type: "STRING" },
          description: "Product names. Omit to compare every product.",
        },
        period: periodProperty,
      },
    },
  },
  {
    name: "getEventDetails",
    description:
      "One market in full: revenue, booth fee, other costs, production cost, profit, return, what sold and what came home unsold. Call with no name for the most recent market.",
    parameters: {
      type: "OBJECT",
      properties: {
        event: { type: "STRING", description: "The market's name as the baker says it." },
      },
    },
  },
  {
    name: "getEventRecommendations",
    description:
      "What to change about the next market, product by product: how many of each were baked, how many sold, how many came home, and how many to bring next time. Use for 'what should I do differently', 'what should I bring more of', 'how do I do better next time'. Always prefer this over getEventDetails for advice about a future market.",
    parameters: {
      type: "OBJECT",
      properties: {
        event: {
          type: "STRING",
          description: "The market's name. Omit for the most recent one.",
        },
      },
    },
  },
  {
    name: "compareEvents",
    description:
      "Compares markets on revenue, cost, profit and return, and says which was better on each. Call with no names to compare the two most recent markets.",
    parameters: {
      type: "OBJECT",
      properties: {
        events: { type: "ARRAY", items: { type: "STRING" }, description: "Market names." },
      },
    },
  },
  {
    name: "getSalesTrends",
    description:
      "How a period compares with the one before it: revenue, units and profit, the change in percent, and which products moved most. Use for 'what changed', 'are cookies slowing down', 'how is this month against last'.",
    parameters: {
      type: "OBJECT",
      properties: {
        period: periodProperty,
        product: { type: "STRING", description: "Optional: only this product." },
      },
    },
  },
  {
    name: "getMarketPricing",
    description:
      "What nearby bakeries charge for a comparable product, from the baker's last local price check: median, average, quartiles, range, how far their price sits from the median, and how many bakeries it came from. Call with no product to rank every product by how far below the local median it is. Never guess local prices without this.",
    parameters: {
      type: "OBJECT",
      properties: {
        product: { type: "STRING", description: "Optional: one product. Omit for all of them." },
      },
    },
  },
  {
    name: "analyzeProductPrice",
    description:
      "What a price change would do: profit per unit and margin at the current price and at several higher ones, plus what the change would have been worth at recent volume. Use for 'what if I charged more', 'should I raise my prices'.",
    parameters: {
      type: "OBJECT",
      properties: {
        product: { type: "STRING", description: "The product's name." },
        proposedPrice: { type: "NUMBER", description: "A specific price to test, if the baker named one." },
      },
      required: ["product"],
    },
  },
];

type Handler = (workspace: Workspace, args: Record<string, unknown>) => ToolOutcome;

const HANDLERS: Record<string, Handler> = {
  getBakerySummary,
  getProductDetails,
  // "what is my most profitable product" is a comparison of everything
  getProductProfitability: getProductDetails,
  compareProducts,
  getEventDetails,
  getEventRecommendations,
  compareEvents,
  getSalesTrends,
  getMarketPricing,
  analyzeProductPrice,
};

export interface DispatchResult {
  result: unknown;
  sources: Array<{ kind: SourceKind; detail: string }>;
}

/**
 * Runs one tool against one workspace. An unknown name is answered rather than
 * thrown: the model is told the tool does not exist and picks another.
 */
export function runTool(
  workspace: Workspace,
  name: string,
  args: Record<string, unknown>,
  log: AskLogger,
): DispatchResult {
  const handler = HANDLERS[name];
  if (!handler) {
    log.event("ASK_BAKETLY_TOOL_REFUSED", { tool: name, reason: "no such tool" });
    return {
      result: { error: "There is no tool called " + name + "." },
      sources: [],
    };
  }
  const started = Date.now();
  try {
    const outcome = handler(workspace, args);
    log.event("ASK_BAKETLY_TOOL_SUCCESS", {
      tool: name,
      ms: Date.now() - started,
      ok: true,
      // shape, not content: never the baker's figures
      available: (outcome.result as { available?: boolean })?.available !== false,
    });
    return outcome;
  } catch (error) {
    log.event("ASK_BAKETLY_TOOL_FAILED", {
      tool: name,
      ms: Date.now() - started,
      ok: false,
      reason: error instanceof Error ? error.message : "tool threw",
    });
    return {
      result: { error: "That lookup failed. Try a different question." },
      sources: [],
    };
  }
}
