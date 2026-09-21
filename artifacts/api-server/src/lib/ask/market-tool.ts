// What the neighbours charge, as far as we actually know.
//
// This reads the price check the baker already ran — the one built on prices
// read from nearby bakeries' own pages — rather than sending the assistant off
// to search the web. If no check has been run, it says so and points at the
// button that runs one. Nothing here asks a model what a cookie costs.

import { findRecipes, productProfit, round2 } from "./metrics";
import type { ToolOutcome } from "./tools";
import type { Workspace } from "./workspace";

interface StoredMarketProduct {
  name?: string;
  price?: number;
  provenance?: string;
  median?: number | null;
  average?: number | null;
  p25?: number | null;
  p75?: number | null;
  localLow?: number | null;
  localHigh?: number | null;
  unitPrice?: number | null;
  quantity?: number;
  userPercentile?: number | null;
  differenceFromMedianPercent?: number | null;
  comparableBakeries?: number;
  comparableProducts?: number;
  suggested?: { competitive?: number; market?: number; premium?: number } | null;
  shortfall?: string | null;
}

function storedProducts(workspace: Workspace): StoredMarketProduct[] {
  const check = workspace.marketCheck;
  if (!check) return [];
  const products = (check as { products?: unknown }).products;
  return Array.isArray(products) ? (products as StoredMarketProduct[]) : [];
}

function checkedAt(workspace: Workspace): string | null {
  const at = (workspace.marketCheck as { checkedAt?: unknown } | null)?.checkedAt;
  return typeof at === "string" ? at.slice(0, 10) : null;
}

/** Only a verified row is a fact about the local market. */
function verified(entry: StoredMarketProduct): boolean {
  return entry.provenance === "verified" && typeof entry.median === "number";
}

function payloadFor(workspace: Workspace, entry: StoredMarketProduct) {
  return {
    currency: (workspace.marketCheck as { currency?: string } | null)?.currency || workspace.currency,
    product: entry.name,
    userPrice: entry.price ?? null,
    userUnitPrice: entry.unitPrice ?? null,
    quantity: entry.quantity ?? 1,
    marketMedian: entry.median ?? null,
    marketAverage: entry.average ?? null,
    p25: entry.p25 ?? null,
    p75: entry.p75 ?? null,
    marketLow: entry.localLow ?? null,
    marketHigh: entry.localHigh ?? null,
    percentFromMedian: entry.differenceFromMedianPercent ?? null,
    userPercentile: entry.userPercentile ?? null,
    comparableBakeryCount: entry.comparableBakeries ?? 0,
    comparableListingCount: entry.comparableProducts ?? 0,
    suggestedPricing: entry.suggested ?? null,
    checkedOn: checkedAt(workspace),
    // every figure here was read from a nearby bakery's own page
    confidence: "verified",
  };
}

export function getMarketPricing(workspace: Workspace, args: { product?: string }): ToolOutcome {
  const rows = storedProducts(workspace);
  if (rows.length === 0) {
    return {
      result: {
        available: false,
        reason:
          "no local price check has been run yet; the baker can run one from What changed on the home screen",
      },
      sources: [],
    };
  }

  const wanted = String(args.product || "").trim().toLowerCase();
  const usable = rows.filter(verified);

  if (!wanted) {
    if (usable.length === 0) {
      return {
        result: {
          available: false,
          reason: "the last price check found no comparable local prices",
          checkedOn: checkedAt(workspace),
        },
        sources: [],
      };
    }
    // Everything we know, cheapest relative to the market first: this is what
    // "which of my products are underpriced" needs.
    const ranked = usable
      .map((entry) => payloadFor(workspace, entry))
      .sort(
        (a, b) => (a.percentFromMedian ?? 0) - (b.percentFromMedian ?? 0),
      );
    return {
      result: { products: ranked, checkedOn: checkedAt(workspace) },
      sources: [
        {
          kind: "market",
          detail:
            ranked.length +
            " products against " +
            Math.max(...ranked.map((row) => row.comparableBakeryCount)) +
            " nearby bakeries",
        },
      ],
    };
  }

  const match =
    usable.find((entry) => (entry.name || "").toLowerCase() === wanted) ||
    usable.find((entry) => (entry.name || "").toLowerCase().includes(wanted)) ||
    (() => {
      const recipe = findRecipes(workspace, wanted)[0];
      return recipe
        ? usable.find((entry) => (entry.name || "").toLowerCase() === (recipe.name || "").toLowerCase())
        : undefined;
    })();

  if (!match) {
    const unpriced = rows.find((entry) => (entry.name || "").toLowerCase().includes(wanted));
    return {
      result: {
        available: false,
        reason: unpriced
          ? unpriced.shortfall || "the last check found no comparable local prices for that product"
          : "that product was not part of the last price check",
        productsChecked: usable.map((entry) => entry.name).slice(0, 12),
        checkedOn: checkedAt(workspace),
      },
      sources: [],
    };
  }

  const payload = payloadFor(workspace, match);
  // the baker's own cost, so the answer can weigh a price change properly
  const recipe = findRecipes(workspace, match.name || "")[0];
  const own = recipe ? productProfit(recipe, workspace) : null;

  return {
    result: {
      ...payload,
      costPerUnit: own ? own.cost.unitCost : null,
      profitPerUnitNow: own ? own.profitPerUnit : null,
      profitPerUnitAtMedian:
        own && typeof match.median === "number"
          ? round2(match.median / (match.quantity || 1) - own.cost.unitCost)
          : null,
    },
    sources: [
      {
        kind: "market",
        detail: payload.comparableBakeryCount + " nearby bakeries, checked " + (payload.checkedOn || "recently"),
      },
    ],
  };
}
