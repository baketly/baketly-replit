// What Ask Baketly can look up.
//
// Each tool answers one business question from the baker's own records, with
// the arithmetic done here and the period it covers stated in the result. The
// model chooses which to call and explains what comes back; it never sees the
// workspace itself, never receives another baker's data — no tool takes a user
// id, they are all bound to the signed-in workspace by the caller — and it
// cannot change anything. Every tool is a read.
//
// Results are deliberately small. "Compare my last two events" returns two
// rollups, not the bakery.

import {
  eventRollup,
  findEvents,
  findRecipes,
  pastEvents,
  productProfit,
  productSales,
  round2,
  salesBetween,
  totalsOf,
  type EventRollup,
  type ProductProfit,
} from "./metrics";
import { previousPeriod, resolvePeriod, type Period } from "./periods";
import type { Workspace } from "./workspace";

/** Every tool says what it looked at, so an answer can show its sources. */
export type SourceKind = "products" | "sales" | "events" | "market" | "pantry";

export interface ToolOutcome {
  /** what the model receives */
  result: unknown;
  /** what the answer was built from, for the source chips */
  sources: Array<{ kind: SourceKind; detail: string }>;
}

const MISSING = (what: string) => ({
  result: { available: false, reason: what },
  sources: [],
});

function moneyIn(workspace: Workspace) {
  return { currency: workspace.currency };
}

// ---------------------------------------------------------------------------
// 1. Bakery overview
// ---------------------------------------------------------------------------

export function getBakerySummary(workspace: Workspace, args: { period?: string }): ToolOutcome {
  const period = resolvePeriod(args.period || "last_30_days");
  const sales = salesBetween(workspace.sales, period.from, period.to);
  const totals = totalsOf(sales);
  const products = productSales(sales);

  const eventsInPeriod = pastEvents(workspace)
    .filter((event) => {
      const day = (event.occurredAt || "").slice(0, 10);
      return day >= period.from && day <= period.to;
    })
    .map((event) => eventRollup(event, workspace));

  const eventCosts = eventsInPeriod.reduce(
    (sum, event) => sum + event.boothFee + event.otherCosts,
    0,
  );
  const profit = round2(totals.revenue - totals.productionCost - eventCosts);

  const byProfit = [...products].sort((a, b) => b.profit - a.profit);
  const catalogue = workspace.recipes.map((recipe) => productProfit(recipe, workspace));
  const bestMargin = [...catalogue].sort((a, b) => b.marginPercent - a.marginPercent)[0] || null;

  return {
    result: {
      ...moneyIn(workspace),
      period: { from: period.from, to: period.to, label: period.label },
      revenue: totals.revenue,
      productionCost: totals.productionCost,
      eventCosts: round2(eventCosts),
      profit,
      profitMarginPercent: totals.revenue > 0 ? Math.round((profit / totals.revenue) * 100) : 0,
      orders: totals.orders,
      unitsSold: totals.units,
      averageOrderValue: totals.orders > 0 ? round2(totals.revenue / totals.orders) : null,
      bestSellingByUnits: products.length
        ? [...products].sort((a, b) => b.units - a.units).slice(0, 3).map((row) => ({ name: row.name, units: row.units }))
        : [],
      mostProfitable: byProfit.slice(0, 3).map((row) => ({ name: row.name, profit: row.profit })),
      bestMarginProduct: bestMargin
        ? { name: bestMargin.name, marginPercent: bestMargin.marginPercent }
        : null,
      events: eventsInPeriod.map((event) => ({
        name: event.name,
        date: event.date,
        revenue: event.revenue,
        profit: event.profit,
        roiPercent: event.roiPercent,
      })),
      productCount: workspace.recipes.length,
      hourlyRateSet: workspace.hourlyRate > 0,
    },
    sources: [
      { kind: "sales", detail: totals.orders + " sales, " + period.label },
      ...(eventsInPeriod.length
        ? [{ kind: "events" as const, detail: eventsInPeriod.length + " markets" }]
        : []),
    ],
  };
}

// ---------------------------------------------------------------------------
// 2 & 3. One product: what it costs, what it earns
// ---------------------------------------------------------------------------

function profitOf(workspace: Workspace, profit: ProductProfit, period: Period) {
  const sales = salesBetween(workspace.sales, period.from, period.to);
  const rows = productSales(sales);
  const sold =
    rows.find((row) => row.productId === profit.productId) ||
    rows.find((row) => row.name.toLowerCase() === profit.name.toLowerCase()) ||
    null;
  return {
    ...moneyIn(workspace),
    product: profit.name,
    productId: profit.productId,
    group: profit.group,
    sellingPrice: profit.sellingPrice,
    ingredientCost: profit.cost.ingredientCost,
    packagingCost: profit.cost.packagingCost,
    labourCost: profit.cost.labourCosted ? profit.cost.labourCost : null,
    labourCosted: profit.cost.labourCosted,
    costPerUnit: profit.cost.unitCost,
    profitPerUnit: profit.profitPerUnit,
    marginPercent: profit.marginPercent,
    period: { from: period.from, to: period.to, label: period.label },
    unitsSold: sold ? sold.units : 0,
    revenue: sold ? sold.revenue : 0,
    estimatedTotalProfit: sold ? round2(sold.units * profit.profitPerUnit) : 0,
    averagePriceActuallyPaid: sold ? sold.averagePrice : null,
  };
}

export function getProductDetails(
  workspace: Workspace,
  args: { product?: string; period?: string },
): ToolOutcome {
  const wanted = String(args.product || "").trim();
  if (!wanted) return MISSING("no product was named");
  const matches = findRecipes(workspace, wanted);
  if (matches.length === 0) {
    return {
      result: {
        available: false,
        reason: "no product called " + wanted,
        productsOnRecord: workspace.recipes.map((recipe) => recipe.name).slice(0, 20),
      },
      sources: [],
    };
  }
  if (matches.length > 1) {
    return {
      result: {
        available: false,
        reason: "more than one product matches " + wanted,
        candidates: matches.map((recipe) => recipe.name).slice(0, 8),
      },
      sources: [],
    };
  }

  const period = resolvePeriod(args.period || "all_time");
  const profit = productProfit(matches[0], workspace);
  return {
    result: profitOf(workspace, profit, period),
    sources: [
      { kind: "products", detail: profit.name + " cost and price" },
      { kind: "sales", detail: "sales, " + period.label },
    ],
  };
}

// ---------------------------------------------------------------------------
// 4. Comparing products
// ---------------------------------------------------------------------------

export function compareProducts(
  workspace: Workspace,
  args: { products?: unknown; period?: string },
): ToolOutcome {
  const names = Array.isArray(args.products)
    ? args.products.filter((entry): entry is string => typeof entry === "string").slice(0, 5)
    : [];
  const period = resolvePeriod(args.period || "all_time");

  // No products named: compare everything the baker sells.
  const chosen = names.length
    ? names.flatMap((name) => findRecipes(workspace, name).slice(0, 1))
    : workspace.recipes;
  if (chosen.length === 0) return MISSING("no products to compare");

  const sales = salesBetween(workspace.sales, period.from, period.to);
  const rows = productSales(sales);

  const compared = chosen.map((recipe) => {
    const profit = productProfit(recipe, workspace);
    const sold =
      rows.find((row) => row.productId === recipe.id) ||
      rows.find((row) => row.name.toLowerCase() === (recipe.name || "").toLowerCase());
    const units = sold ? sold.units : 0;
    return {
      product: profit.name,
      sellingPrice: profit.sellingPrice,
      costPerUnit: profit.cost.unitCost,
      profitPerUnit: profit.profitPerUnit,
      marginPercent: profit.marginPercent,
      unitsSold: units,
      revenue: sold ? sold.revenue : 0,
      totalProfit: round2(units * profit.profitPerUnit),
    };
  });

  const byTotalProfit = [...compared].sort((a, b) => b.totalProfit - a.totalProfit);
  const byMargin = [...compared].sort((a, b) => b.marginPercent - a.marginPercent);
  const byPerUnit = [...compared].sort((a, b) => b.profitPerUnit - a.profitPerUnit);

  return {
    result: {
      ...moneyIn(workspace),
      period: { from: period.from, to: period.to, label: period.label },
      products: compared.slice(0, 12),
      mostTotalProfit: byTotalProfit[0]?.product ?? null,
      bestMargin: byMargin[0]?.product ?? null,
      mostProfitPerUnit: byPerUnit[0]?.product ?? null,
      // the gap, so the answer can say how much better rather than "better"
      profitDifference:
        byTotalProfit.length > 1
          ? round2(byTotalProfit[0].totalProfit - byTotalProfit[1].totalProfit)
          : null,
    },
    sources: [
      { kind: "products", detail: compared.length + " products" },
      { kind: "sales", detail: "sales, " + period.label },
    ],
  };
}

// ---------------------------------------------------------------------------
// 5 & 6. Markets
// ---------------------------------------------------------------------------

function eventPayload(rollup: EventRollup) {
  return {
    name: rollup.name,
    date: rollup.date,
    status: rollup.status,
    revenue: rollup.revenue,
    boothFee: rollup.boothFee,
    otherCosts: rollup.otherCosts,
    productionCost: rollup.productionCost,
    totalCost: rollup.totalCost,
    profit: rollup.profit,
    marginPercent: rollup.marginPercent,
    roiPercent: rollup.roiPercent,
    unitsSold: rollup.unitsSold,
    products: rollup.products.slice(0, 8).map((row) => ({
      name: row.name,
      units: row.units,
      revenue: row.revenue,
      profit: row.profit,
    })),
    unsold: rollup.unsold.filter((row) => row.left > 0).slice(0, 8),
  };
}

export function getEventDetails(workspace: Workspace, args: { event?: string }): ToolOutcome {
  const wanted = String(args.event || "").trim();
  const candidates = wanted ? findEvents(workspace, wanted) : pastEvents(workspace).slice(0, 1);

  if (candidates.length === 0) {
    return {
      result: {
        available: false,
        reason: wanted ? "no market called " + wanted : "no markets on record",
        marketsOnRecord: pastEvents(workspace).slice(0, 10).map((event) => ({
          name: event.name,
          date: (event.occurredAt || "").slice(0, 10),
        })),
      },
      sources: [],
    };
  }
  if (candidates.length > 1) {
    return {
      result: {
        available: false,
        reason: "more than one market matches " + wanted,
        candidates: candidates.slice(0, 6).map((event) => ({
          name: event.name,
          date: (event.occurredAt || "").slice(0, 10),
        })),
      },
      sources: [],
    };
  }

  const rollup = eventRollup(candidates[0], workspace);
  return {
    result: { ...moneyIn(workspace), ...eventPayload(rollup) },
    sources: [{ kind: "events", detail: rollup.name + ", " + rollup.date }],
  };
}

export function compareEvents(workspace: Workspace, args: { events?: unknown }): ToolOutcome {
  const names = Array.isArray(args.events)
    ? args.events.filter((entry): entry is string => typeof entry === "string").slice(0, 4)
    : [];

  const chosen = names.length
    ? names.flatMap((name) => findEvents(workspace, name).slice(0, 1))
    : pastEvents(workspace).slice(0, 2);

  if (chosen.length < 2) {
    return {
      result: {
        available: false,
        reason:
          chosen.length === 0
            ? "no markets on record to compare"
            : "only one market matched, so there is nothing to compare it with",
        marketsOnRecord: pastEvents(workspace).slice(0, 10).map((event) => ({
          name: event.name,
          date: (event.occurredAt || "").slice(0, 10),
        })),
      },
      sources: [],
    };
  }

  const rollups = chosen.map((event) => eventRollup(event, workspace));
  const byProfit = [...rollups].sort((a, b) => b.profit - a.profit);
  const byRoi = [...rollups].sort((a, b) => (b.roiPercent ?? -1) - (a.roiPercent ?? -1));
  const byRevenue = [...rollups].sort((a, b) => b.revenue - a.revenue);

  return {
    result: {
      ...moneyIn(workspace),
      events: rollups.map(eventPayload),
      comparison: {
        profitDifference: round2(byProfit[0].profit - byProfit[byProfit.length - 1].profit),
        revenueDifference: round2(byRevenue[0].revenue - byRevenue[byRevenue.length - 1].revenue),
        betterProfitEvent: byProfit[0].name,
        betterRoiEvent: byRoi[0].roiPercent === null ? null : byRoi[0].name,
        betterRevenueEvent: byRevenue[0].name,
      },
    },
    sources: [{ kind: "events", detail: rollups.length + " markets" }],
  };
}

// ---------------------------------------------------------------------------
// 7. Trends
// ---------------------------------------------------------------------------

export function getSalesTrends(
  workspace: Workspace,
  args: { period?: string; product?: string },
): ToolOutcome {
  const period = resolvePeriod(args.period || "this_month");
  const before = previousPeriod(period);

  const wanted = String(args.product || "").trim();
  const only = wanted ? findRecipes(workspace, wanted).slice(0, 1)[0] : null;
  if (wanted && !only) {
    return MISSING("no product called " + wanted);
  }

  const forPeriod = (window: Period) => {
    const sales = salesBetween(workspace.sales, window.from, window.to);
    const rows = productSales(sales);
    if (only) {
      const row =
        rows.find((entry) => entry.productId === only.id) ||
        rows.find((entry) => entry.name.toLowerCase() === (only.name || "").toLowerCase());
      return {
        revenue: row ? row.revenue : 0,
        units: row ? row.units : 0,
        profit: row ? row.profit : 0,
        orders: row ? row.orders : 0,
      };
    }
    const totals = totalsOf(sales);
    return {
      revenue: totals.revenue,
      units: totals.units,
      profit: round2(totals.revenue - totals.productionCost),
      orders: totals.orders,
    };
  };

  const now = forPeriod(period);
  const then = forPeriod(before);
  const change = (current: number, previous: number) =>
    previous > 0 ? Math.round(((current - previous) / previous) * 100) : null;

  // which products moved, when the question is about the bakery as a whole
  const movers = only
    ? []
    : (() => {
        const nowRows = productSales(salesBetween(workspace.sales, period.from, period.to));
        const thenRows = productSales(salesBetween(workspace.sales, before.from, before.to));
        const thenByName = new Map(thenRows.map((row) => [row.name.toLowerCase(), row]));
        return nowRows
          .map((row) => {
            const previous = thenByName.get(row.name.toLowerCase());
            return {
              name: row.name,
              units: row.units,
              previousUnits: previous ? previous.units : 0,
              unitChange: row.units - (previous ? previous.units : 0),
              revenue: row.revenue,
              revenueChange: round2(row.revenue - (previous ? previous.revenue : 0)),
            };
          })
          .sort((a, b) => Math.abs(b.revenueChange) - Math.abs(a.revenueChange))
          .slice(0, 6);
      })();

  return {
    result: {
      ...moneyIn(workspace),
      product: only ? only.name : null,
      period: { from: period.from, to: period.to, label: period.label, ...now },
      comparedWith: { from: before.from, to: before.to, label: before.label, ...then },
      revenueChangePercent: change(now.revenue, then.revenue),
      unitChangePercent: change(now.units, then.units),
      profitChange: round2(now.profit - then.profit),
      movers,
    },
    sources: [{ kind: "sales", detail: period.label + " vs " + before.label }],
  };
}

// ---------------------------------------------------------------------------
// 9. Price scenarios
// ---------------------------------------------------------------------------

export function analyzeProductPrice(
  workspace: Workspace,
  args: { product?: string; proposedPrice?: unknown },
): ToolOutcome {
  const wanted = String(args.product || "").trim();
  const matches = wanted ? findRecipes(workspace, wanted) : [];
  if (matches.length !== 1) {
    return {
      result: {
        available: false,
        reason: matches.length === 0 ? "no product called " + wanted : "more than one product matches",
        candidates: matches.slice(0, 8).map((recipe) => recipe.name),
      },
      sources: [],
    };
  }

  const recipe = matches[0];
  const profit = productProfit(recipe, workspace);
  const period = resolvePeriod("last_90_days");
  const sold = productSales(salesBetween(workspace.sales, period.from, period.to)).find(
    (row) => row.productId === recipe.id || row.name.toLowerCase() === (recipe.name || "").toLowerCase(),
  );
  const units = sold ? sold.units : 0;

  const proposed = Number(args.proposedPrice);
  const steps = [1, 2, 3, 4].map((step) => round2(profit.sellingPrice + step));
  const prices = [
    ...(Number.isFinite(proposed) && proposed > 0 ? [round2(proposed)] : []),
    ...steps,
  ]
    .filter((price, index, all) => all.indexOf(price) === index)
    .slice(0, 5);

  const scenarios = prices.map((price) => ({
    price,
    profitPerUnit: round2(price - profit.cost.unitCost),
    marginPercent: price > 0 ? Math.round(((price - profit.cost.unitCost) / price) * 100) : 0,
    // what the change would have been worth over what they actually sold
    extraProfitAtRecentVolume: round2((price - profit.sellingPrice) * units),
  }));

  return {
    result: {
      ...moneyIn(workspace),
      product: profit.name,
      current: {
        price: profit.sellingPrice,
        costPerUnit: profit.cost.unitCost,
        profitPerUnit: profit.profitPerUnit,
        marginPercent: profit.marginPercent,
      },
      scenarios,
      recentVolume: { units, period: period.label },
      note:
        "extraProfitAtRecentVolume assumes the same number sold at the new price, which is an assumption, not a measurement",
    },
    sources: [
      { kind: "products", detail: profit.name + " cost and price" },
      { kind: "sales", detail: "volume, " + period.label },
    ],
  };
}
