// The bakery's numbers, worked out once.
//
// Every figure Ask Baketly quotes comes from here: what a bake costs, what a
// product earns, what a market kept after its costs, how a month compares with
// the one before. The model is never asked to do this arithmetic — it is given
// the results and asked what they mean.
//
// The sums are the ones the app already shows on its own screens. They were
// written twice, once in the browser bundle and once in the snapshot builder;
// this is the version the server owns, so the assistant and the screens can
// never quietly disagree.

import type {
  EventRecord,
  IngredientRecord,
  PackagingRecord,
  Recipe,
  Sale,
  Workspace,
} from "./workspace";

export const round2 = (value: number): number => Math.round(value * 100) / 100;

const pct = (part: number, whole: number): number =>
  whole > 0 ? Math.round((part / whole) * 100) : 0;

/** What one unit of an ingredient costs, from the pack price the baker entered. */
export function ingredientUnitCost(record: IngredientRecord | undefined): number {
  if (!record) return 0;
  const price = Number(record.packagePrice) || 0;
  const size = Number(record.packageSize) || 0;
  return size > 0 ? price / size : 0;
}

/** What one piece of packaging costs, from the pack price. */
export function packagingUnitCost(record: PackagingRecord | undefined): number {
  if (!record) return 0;
  const price = Number(record.packPrice) || 0;
  const units = Number(record.unitsPerPack) || 0;
  return units > 0 ? price / units : 0;
}

export interface CostBreakdown {
  ingredientCost: number;
  packagingCost: number;
  labourCost: number;
  unitCost: number;
  /** null when the baker has not set an hourly rate, so labour is not costed */
  labourCosted: boolean;
}

/**
 * What one unit of a recipe costs to make: its share of the batch's
 * ingredients, its own packaging, and its share of the time it took, when the
 * baker has told us what their hour is worth.
 */
export function recipeCost(recipe: Recipe, workspace: Workspace): CostBreakdown {
  const yieldCount = Math.max(1, Number(recipe.yield) || 1);
  const amounts = recipe.amounts || {};

  const batchIngredients = (recipe.ingredientKeys || []).reduce((sum, key) => {
    const amount = Number(amounts[key]) || 0;
    return sum + amount * ingredientUnitCost(workspace.ingredients[key]);
  }, 0);

  const packaging = (recipe.packagingKeys || []).reduce(
    (sum, key) => sum + packagingUnitCost(workspace.packaging[key]),
    0,
  );

  const rate = Math.max(0, workspace.hourlyRate);
  const minutes = Math.max(0, Number(recipe.activeMinutes) || 0);
  const labour = (rate / 60) * minutes / yieldCount;

  const ingredientCost = batchIngredients / yieldCount;
  return {
    ingredientCost: round2(ingredientCost),
    packagingCost: round2(packaging),
    labourCost: round2(labour),
    unitCost: round2(ingredientCost + packaging + labour),
    labourCosted: rate > 0 && minutes > 0,
  };
}

export interface ProductProfit {
  productId: string;
  name: string;
  group: string;
  sellingPrice: number;
  cost: CostBreakdown;
  profitPerUnit: number;
  marginPercent: number;
}

/** The name the baker gave the group a recipe is filed under. */
export function groupName(workspace: Workspace, id: unknown): string {
  const found = workspace.recipeGroups.find((group) => group && group.id === id);
  return (found?.name || "").trim() || "No group";
}

export function productProfit(recipe: Recipe, workspace: Workspace): ProductProfit {
  const price = Number(recipe.price) || 0;
  const cost = recipeCost(recipe, workspace);
  return {
    productId: recipe.id,
    name: recipe.name,
    group: groupName(workspace, recipe.type),
    sellingPrice: round2(price),
    cost,
    profitPerUnit: round2(price - cost.unitCost),
    marginPercent: pct(price - cost.unitCost, price),
  };
}

// ---------------------------------------------------------------------------
// Sales
// ---------------------------------------------------------------------------

export interface SalesTotals {
  revenue: number;
  productionCost: number;
  units: number;
  orders: number;
}

export interface ProductSales extends SalesTotals {
  productId: string;
  name: string;
  profit: number;
  marginPercent: number;
  averagePrice: number;
}

/** Sales in a window, by the day they happened. */
export function salesBetween(sales: Sale[], from: string, to: string): Sale[] {
  return sales.filter((sale) => {
    const day = (sale.occurredAt || "").slice(0, 10);
    return !!day && day >= from && day <= to;
  });
}

export function totalsOf(sales: Sale[]): SalesTotals {
  let revenue = 0;
  let productionCost = 0;
  let units = 0;
  for (const sale of sales) {
    revenue += Number(sale.total) || 0;
    for (const line of sale.lineItems || []) {
      const quantity = Number(line.quantity) || 0;
      units += quantity;
      productionCost += quantity * (Number(line.unitCost) || 0);
    }
  }
  return {
    revenue: round2(revenue),
    productionCost: round2(productionCost),
    units,
    orders: sales.length,
  };
}

/** What each product did over a set of sales, best revenue first. */
export function productSales(sales: Sale[]): ProductSales[] {
  const byProduct = new Map<string, ProductSales & { orderIds: Set<string> }>();
  for (const sale of sales) {
    for (const line of sale.lineItems || []) {
      const key = line.productId || line.name || "unknown";
      const row =
        byProduct.get(key) ||
        {
          productId: line.productId || "",
          name: line.name || "Unknown",
          revenue: 0,
          productionCost: 0,
          units: 0,
          orders: 0,
          profit: 0,
          marginPercent: 0,
          averagePrice: 0,
          orderIds: new Set<string>(),
        };
      const quantity = Number(line.quantity) || 0;
      row.units += quantity;
      row.revenue += quantity * (Number(line.unitPrice) || 0);
      row.productionCost += quantity * (Number(line.unitCost) || 0);
      row.orderIds.add(sale.id || sale.occurredAt || "");
      byProduct.set(key, row);
    }
  }

  return [...byProduct.values()]
    .map((row) => {
      const revenue = round2(row.revenue);
      const productionCost = round2(row.productionCost);
      return {
        productId: row.productId,
        name: row.name,
        revenue,
        productionCost,
        units: row.units,
        orders: row.orderIds.size,
        profit: round2(revenue - productionCost),
        marginPercent: pct(revenue - productionCost, revenue),
        averagePrice: row.units > 0 ? round2(revenue / row.units) : 0,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export interface EventRollup {
  eventId: string;
  name: string;
  date: string;
  status: string;
  revenue: number;
  productionCost: number;
  boothFee: number;
  otherCosts: number;
  totalCost: number;
  profit: number;
  marginPercent: number;
  /** profit as a share of what the market cost to do */
  roiPercent: number | null;
  unitsSold: number;
  products: ProductSales[];
  /** planned but not sold, where a plan was made */
  unsold: Array<{ name: string; planned: number; sold: number; left: number }>;
}

/** Everything one market took and cost, the way the event screen works it out. */
export function eventRollup(event: EventRecord, workspace: Workspace): EventRollup {
  const eventId = event.id || "";
  const sales = workspace.sales.filter((sale) => sale.eventId && sale.eventId === eventId);
  const totals = totalsOf(sales);
  const products = productSales(sales);

  const boothFee = Number(event.boothFee) || 0;
  const otherCosts = (event.otherCosts || []).reduce(
    (sum, cost) => sum + (Number(cost?.amount) || 0),
    0,
  );
  const totalCost = totals.productionCost + boothFee + otherCosts;
  const profit = totals.revenue - totalCost;

  const soldByProduct = new Map(products.map((row) => [row.productId || row.name, row.units]));
  const unsold = (event.plannedItems || [])
    .map((item) => {
      const planned = Number(item?.quantity) || 0;
      const sold = soldByProduct.get(item?.productId || item?.name || "") || 0;
      return { name: item?.name || "Unknown", planned, sold, left: Math.max(0, planned - sold) };
    })
    .filter((row) => row.planned > 0);

  return {
    eventId,
    name: event.name || "Market",
    date: (event.occurredAt || "").slice(0, 10),
    status: event.status || "planned",
    revenue: totals.revenue,
    productionCost: totals.productionCost,
    boothFee: round2(boothFee),
    otherCosts: round2(otherCosts),
    totalCost: round2(totalCost),
    profit: round2(profit),
    marginPercent: pct(profit, totals.revenue),
    // What each dollar spent on the market came back as profit. Undefined when
    // the market cost nothing, because dividing by nothing is not a return.
    roiPercent: totalCost > 0 ? Math.round((profit / totalCost) * 100) : null,
    unitsSold: totals.units,
    products,
    unsold,
  };
}

/** Markets that have happened, newest first. */
export function pastEvents(workspace: Workspace): EventRecord[] {
  const today = new Date().toISOString().slice(0, 10);
  return workspace.events
    .filter((event) => {
      const day = (event.occurredAt || "").slice(0, 10);
      return !!day && (event.status === "completed" || day <= today);
    })
    .sort((a, b) => (b.occurredAt || "").localeCompare(a.occurredAt || ""));
}

/** Finds a market by name, the way a baker would say it. */
export function findEvents(workspace: Workspace, nameOrId: string): EventRecord[] {
  const wanted = nameOrId.trim().toLowerCase();
  if (!wanted) return [];
  const exactId = workspace.events.filter((event) => (event.id || "").toLowerCase() === wanted);
  if (exactId.length) return exactId;
  const exactName = workspace.events.filter(
    (event) => (event.name || "").trim().toLowerCase() === wanted,
  );
  if (exactName.length) return exactName;
  return workspace.events.filter((event) =>
    (event.name || "").toLowerCase().includes(wanted),
  );
}

/** Finds a product by name or id, tolerantly. */
export function findRecipes(workspace: Workspace, nameOrId: string): Recipe[] {
  const wanted = nameOrId.trim().toLowerCase();
  if (!wanted) return [];
  const byId = workspace.recipes.filter((recipe) => (recipe.id || "").toLowerCase() === wanted);
  if (byId.length) return byId;
  const exact = workspace.recipes.filter(
    (recipe) => (recipe.name || "").trim().toLowerCase() === wanted,
  );
  if (exact.length) return exact;
  const contains = workspace.recipes.filter((recipe) =>
    (recipe.name || "").toLowerCase().includes(wanted),
  );
  if (contains.length) return contains;
  // "cookies" should still find "Big M&M Cookie"
  const words = wanted.split(/\s+/).filter((word) => word.length > 3);
  return workspace.recipes.filter((recipe) => {
    const name = (recipe.name || "").toLowerCase();
    return words.some((word) => name.includes(word.replace(/s$/, "")));
  });
}
