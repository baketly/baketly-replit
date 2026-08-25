// Ask Baketly: turns the workspace state into a compact snapshot the model can
// reason over, and posts it with the baker's question.
//
// The snapshot is deliberately small and pre-summarised. Raw sales would blow
// past the request limit within a season, and the model reasons better over
// monthly totals than over hundreds of individual orders.

export type AskAnswer = {
  answer: string;
  wins: string[];
  followUps: string[];
};

type Meta = Record<string, { name?: string; unit?: string; per?: number } | undefined>;

type SaleLine = { productId?: string; name?: string; quantity?: number; unitPrice?: number; unitCost?: number };
type Sale = { occurredAt?: string; total?: number; lineItems?: SaleLine[] };
type EventRecord = { id?: string; name?: string; occurredAt?: string; boothFee?: number };
type Recipe = {
  id?: string; name?: string; type?: string; price?: number; yield?: number;
  ingredientKeys?: string[]; packagingKeys?: string[]; amounts?: Record<string, number>;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

type Tally = { name: string; units: number; revenue: number };

// Comparisons are where the model slips: given a correct list it still named a
// $210 product as the month's revenue leader over a $285 one. Work the
// superlatives out here so answering them is reporting, not arithmetic.
function leadersOf(rows: Tally[]): {
  mostUnits: { name: string; units: number } | null;
  mostRevenue: { name: string; revenue: number } | null;
} {
  if (rows.length === 0) return { mostUnits: null, mostRevenue: null };
  const byUnits = rows.reduce((best, row) => (row.units > best.units ? row : best));
  const byRevenue = rows.reduce((best, row) => (row.revenue > best.revenue ? row : best));
  return {
    mostUnits: { name: byUnits.name, units: byUnits.units },
    mostRevenue: { name: byRevenue.name, revenue: round2(byRevenue.revenue) },
  };
}

type EventMetaEntry = { k?: string; name?: string; price?: number };

export function buildAskContext(
  state: Record<string, unknown>,
  ingredientMeta: Meta,
  packagingMeta: Meta,
  eventMeta: EventMetaEntry[] = [],
): Record<string, unknown> {
  const recipes = (Array.isArray(state.recipeRecords) ? state.recipeRecords : []) as Recipe[];
  const sales = (Array.isArray(state.saleRecords) ? state.saleRecords : []) as Sale[];
  const events = (Array.isArray(state.eventRecords) ? state.eventRecords : []) as EventRecord[];
  const removedIngredients = new Set(
    (Array.isArray(state.removedIngredientKeys) ? state.removedIngredientKeys : []) as string[],
  );

  const unitCostOf = (recipe: Recipe): number => {
    const yieldCount = Math.max(1, Number(recipe.yield) || 1);
    const ingredients = (recipe.ingredientKeys || []).reduce((sum, key) => {
      const amount = Number((recipe.amounts || {})[key]) || 0;
      return sum + amount * (ingredientMeta[key]?.per || 0);
    }, 0);
    const packaging = (recipe.packagingKeys || []).reduce(
      (sum, key) => sum + (packagingMeta[key]?.per || 0),
      0,
    );
    return ingredients / yieldCount + packaging;
  };

  const recipeSummaries = recipes.slice(0, 30).map((recipe) => {
    const price = Number(recipe.price) || 0;
    const unitCost = round2(unitCostOf(recipe));
    return {
      name: recipe.name,
      type: recipe.type,
      price,
      unitCost,
      marginPct: price > 0 ? Math.round(((price - unitCost) / price) * 100) : 0,
      batchYield: Number(recipe.yield) || 1,
      // a rough stand-in for effort: how many things go into one bake
      ingredientCount: (recipe.ingredientKeys || []).length,
      profitPerUnit: round2(price - unitCost),
    };
  });

  // months, newest first, from the sale ledger
  const byMonth: Record<
    string,
    { revenue: number; productionCost: number; items: number; orders: number; products: Record<string, { name: string; units: number; revenue: number; cost: number }> }
  > = {};
  for (const sale of sales) {
    const month = (sale.occurredAt || "").slice(0, 7);
    if (!month) continue;
    const bucket = (byMonth[month] ||= { revenue: 0, productionCost: 0, items: 0, orders: 0, products: {} });
    bucket.revenue += Number(sale.total) || 0;
    bucket.orders += 1;
    for (const line of sale.lineItems || []) {
      const quantity = Number(line.quantity) || 0;
      const cost = quantity * (Number(line.unitCost) || 0);
      const revenue = quantity * (Number(line.unitPrice) || 0);
      bucket.productionCost += cost;
      bucket.items += quantity;
      const key = line.productId || line.name || "unknown";
      const product = (bucket.products[key] ||= { name: line.name || "Unknown", units: 0, revenue: 0, cost: 0 });
      product.units += quantity;
      product.revenue += revenue;
      product.cost += cost;
    }
  }

  // "What was my best seller?" is usually a question about the whole history,
  // not the current month, so carry lifetime product totals as well.
  const lifetime: Record<string, { name: string; units: number; revenue: number; cost: number }> = {};
  let firstSale = "";
  let lastSale = "";
  for (const sale of sales) {
    const at = (sale.occurredAt || "").slice(0, 10);
    if (at) {
      if (!firstSale || at < firstSale) firstSale = at;
      if (!lastSale || at > lastSale) lastSale = at;
    }
    for (const line of sale.lineItems || []) {
      const quantity = Number(line.quantity) || 0;
      const key = line.productId || line.name || "unknown";
      const product = (lifetime[key] ||= { name: line.name || "Unknown", units: 0, revenue: 0, cost: 0 });
      product.units += quantity;
      product.revenue += quantity * (Number(line.unitPrice) || 0);
      product.cost += quantity * (Number(line.unitCost) || 0);
    }
  }
  const lifetimeProducts = Object.values(lifetime)
    .sort((a, b) => b.units - a.units)
    .slice(0, 15)
    .map((product) => ({
      name: product.name,
      units: product.units,
      revenue: round2(product.revenue),
      productionCost: round2(product.cost),
      marginPct:
        product.revenue > 0
          ? Math.round(((product.revenue - product.cost) / product.revenue) * 100)
          : 0,
    }));

  const boothFeesFor = (month: string) =>
    events
      .filter((event) => (event.occurredAt || "").slice(0, 7) === month)
      .reduce((sum, event) => sum + (Number(event.boothFee) || 0), 0);

  const monthKeys = Object.keys(byMonth).sort().reverse().slice(0, 6);
  const months = monthKeys.map((month) => {
    const bucket = byMonth[month];
    const boothFees = boothFeesFor(month);
    const profit = bucket.revenue - bucket.productionCost - boothFees;
    return {
      month,
      revenue: round2(bucket.revenue),
      productionCost: round2(bucket.productionCost),
      boothFees: round2(boothFees),
      profit: round2(profit),
      marginPct: bucket.revenue > 0 ? Math.round((profit / bucket.revenue) * 100) : 0,
      items: bucket.items,
      orders: bucket.orders,
      // per-product detail for every month, not just the newest: without it the
      // model answers "best seller in July" using the latest month's numbers
      bestSellers: leadersOf(Object.values(bucket.products)),
      products: Object.values(bucket.products)
        .sort((a, b) => b.units - a.units)
        .slice(0, 8)
        .map((product) => ({
          name: product.name,
          units: product.units,
          revenue: round2(product.revenue),
        })),
    };
  });

  const latest = monthKeys[0] ? byMonth[monthKeys[0]] : null;
  const latestProducts = latest
    ? Object.values(latest.products)
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10)
        .map((product) => ({
          name: product.name,
          units: product.units,
          revenue: round2(product.revenue),
          productionCost: round2(product.cost),
          marginPct: product.revenue > 0 ? Math.round(((product.revenue - product.cost) / product.revenue) * 100) : 0,
        }))
    : [];

  const salesByEvent: Record<string, number> = {};
  for (const sale of sales as Array<Sale & { eventId?: string }>) {
    if (sale.eventId) salesByEvent[sale.eventId] = (salesByEvent[sale.eventId] || 0) + (Number(sale.total) || 0);
  }
  const eventSummaries = events
    .slice()
    .sort((a, b) => new Date(b.occurredAt || 0).getTime() - new Date(a.occurredAt || 0).getTime())
    .slice(0, 8)
    .map((event) => {
      const revenue = salesByEvent[event.id || ""] || 0;
      const boothFee = Number(event.boothFee) || 0;
      const profit = revenue - boothFee;
      return {
        name: event.name,
        date: (event.occurredAt || "").slice(0, 10),
        revenue: round2(revenue),
        boothFee: round2(boothFee),
        profitAfterBoothFee: round2(profit),
      };
    });

  // Planned quantities are keyed by the event lineup's own key, not the recipe
  // id, so resolve through the lineup metadata the way the event screen does.
  const plannedQuantities = (state.evQty || {}) as Record<string, unknown>;
  const plannedLineup = { items: [] as Array<{ name: string; quantity: number; price: number }>, revenue: 0 };
  for (const [key, value] of Object.entries(plannedQuantities)) {
    const quantity = Math.max(0, Math.round(Number(value) || 0));
    if (quantity <= 0) continue;
    const meta = eventMeta.find((entry) => entry.k === key);
    const recipe = recipes.find(
      (entry) => entry.id === key || (!!meta?.name && entry.name === meta.name),
    );
    const name = recipe?.name || meta?.name || "";
    const price = Number(recipe?.price ?? meta?.price ?? 0) || 0;
    if (!name || price <= 0) continue;
    plannedLineup.items.push({ name, quantity, price });
    plannedLineup.revenue += quantity * price;
  }
  plannedLineup.revenue = round2(plannedLineup.revenue);

  const ingredientKeys = Object.keys(ingredientMeta).filter((key) => !removedIngredients.has(key));
  const costliest = ingredientKeys
    .map((key) => ({ name: ingredientMeta[key]?.name || key, costPerUnit: round2((ingredientMeta[key]?.per || 0) * 1000) / 1000, unit: ingredientMeta[key]?.unit || "g" }))
    .sort((a, b) => b.costPerUnit - a.costPerUnit)
    .slice(0, 8);

  return {
    currency: "USD",
    today: new Date().toISOString().slice(0, 10),
    pantry: {
      ingredientCount: ingredientKeys.length,
      packagingCount: Object.keys(packagingMeta).length,
      costliestIngredients: costliest,
    },
    recipes: recipeSummaries,
    months,
    salesPeriod: firstSale && lastSale ? { from: firstSale, to: lastSale } : null,
    bestSellersAllTime: leadersOf(Object.values(lifetime)),
    productTotalsAllTime: lifetimeProducts,
    latestMonthProducts: latestProducts,
    events: eventSummaries,
    upcomingEvent: state.eventName
      ? {
          name: state.eventName,
          date: state.eventDate,
          boothFee: Number(state.eventBoothFee) || 0,
          // what is already in the lineup, so a target question starts from the gap
          plannedLineup: plannedLineup.items,
          plannedRevenue: plannedLineup.revenue,
        }
      : null,
  };
}

export async function askBaketly(
  question: string,
  context: Record<string, unknown>,
  history: Array<{ who: string; text: string }>,
): Promise<AskAnswer> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 40_000);
  try {
    const response = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, context, history: history.slice(-8) }),
      signal: controller.signal,
    });
    const payload = (await response.json().catch(() => ({}))) as Partial<AskAnswer> & { error?: unknown };
    if (!response.ok) {
      throw new Error(
        typeof payload.error === "string"
          ? payload.error
          : "I couldn't answer that right now.",
      );
    }
    return {
      answer: typeof payload.answer === "string" ? payload.answer : "",
      wins: Array.isArray(payload.wins) ? payload.wins : [],
      followUps: Array.isArray(payload.followUps) ? payload.followUps : [],
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("That took too long to answer. Try asking again.");
    }
    if (error instanceof TypeError) {
      throw new Error("I couldn't reach Baketly. Check your connection and try again.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}
