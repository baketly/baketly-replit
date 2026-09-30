// The pantry, and what to do next.
//
// Two tools that were missing, both found by asking the chat questions a baker
// asks in their first week.
//
// "Which ingredient costs me the most?" had no tool at all, so the model
// answered about a product instead — the nearest thing it could look up. An
// agent reading a database should be able to read the pantry.
//
// "What should I do next?" was improvised from whatever happened to be
// salient. It is not a question about their numbers, it is a question about
// their setup, and the answer is the same every time for a given shape of
// bakery: the ladder below. Worked out here rather than reasoned about, so it
// cannot drift and costs nothing.

import { ingredientUnitCost, round2 } from "./metrics";
import type { ToolOutcome } from "./tools";
import type { Workspace } from "./workspace";



const countOf = (n: number, one: string, many: string): string =>
  `${n} ${n === 1 ? one : many}`;

/**
 * What is in the pantry, what each thing costs, and where it is used.
 *
 * Sorted by what it actually costs the bakery over the recipes that use it,
 * not by the price on the sack: a £40 vanilla paste used by the drop is a
 * smaller problem than flour, and a baker deciding where to shop around is
 * asking about the second one.
 */
export function getPantry(workspace: Workspace): ToolOutcome {
  const keys = Object.keys(workspace.ingredients);
  if (keys.length === 0) {
    return {
      result: {
        currency: workspace.currency,
        available: false,
        reason: "No ingredients recorded yet.",
        ingredients: [],
      },
      sources: [],
    };
  }

  const rows = keys.map((key) => {
    const record = workspace.ingredients[key];
    const perUnit = ingredientUnitCost(record);
    // what this ingredient contributes to one of each recipe that uses it
    const usedIn = workspace.recipes.filter((recipe) =>
      (recipe.ingredientKeys || []).includes(key),
    );
    const costPerBake = usedIn.reduce((sum, recipe) => {
      const amount = Number((recipe.amounts || {})[key]) || 0;
      const made = Math.max(1, Number(recipe.yield) || 1);
      return sum + (amount * perUnit) / made;
    }, 0);
    return {
      name: record?.name || key,
      supplier: record?.supplier || null,
      packagePrice: round2(Number(record?.packagePrice) || 0),
      packageSize: Number(record?.packageSize) || 0,
      unit: record?.unit || "g",
      costPerUnit: Number(perUnit.toFixed(5)),
      usedInProducts: usedIn.length,
      usedIn: usedIn.map((recipe) => recipe.name).slice(0, 8),
      // summed across every recipe that uses it, one unit of each
      costAcrossProducts: round2(costPerBake),
    };
  });

  const byCost = [...rows].sort((a, b) => b.costAcrossProducts - a.costAcrossProducts);
  const unused = rows.filter((row) => row.usedInProducts === 0);

  return {
    result: {
      currency: workspace.currency,
      available: true,
      ingredientCount: rows.length,
      // the one a baker should look at first if they want to shop around
      dearestAcrossProducts: byCost[0]
        ? { name: byCost[0].name, costAcrossProducts: byCost[0].costAcrossProducts }
        : null,
      unusedCount: unused.length,
      unused: unused.map((row) => row.name).slice(0, 8),
      ingredients: byCost.slice(0, 40),
    },
    sources: [{ kind: "pantry", detail: countOf(rows.length, "ingredient", "ingredients") }],
  };
}

export type SetupStep =
  | "add_ingredients"
  | "add_recipe"
  | "price_recipes"
  | "record_sales"
  | "more_sales"
  | "set_hourly_rate"
  | "add_batch_times"
  | "plan_market"
  | "run_price_check"
  | "nothing_pressing";

/**
 * The one thing worth doing next, and why.
 *
 * In order, because each rung needs the one under it: a price is meaningless
 * before a cost, a cost before its ingredients, and nothing at all can be said
 * about what sells until something has been sold. The ladder stops at the
 * first rung that is not done, so a baker is asked for one thing rather than
 * handed a list.
 */
export function getNextStep(workspace: Workspace): ToolOutcome {
  const ingredientCount = Object.keys(workspace.ingredients).length;
  const recipes = workspace.recipes;
  const sales = workspace.sales.length;
  const priced = recipes.filter((recipe) => (Number(recipe.price) || 0) > 0).length;
  const missingBatchTime = recipes.filter(
    (recipe) => !(Number(recipe.activeMinutes) > 0),
  ).length;

  const step = (
    value: SetupStep,
    why: string,
    extra: Record<string, unknown> = {},
  ): ToolOutcome => ({
    result: {
      step: value,
      why,
      ingredientCount,
      recipeCount: recipes.length,
      salesCount: sales,
      marketCount: workspace.events.length,
      hourlyRateSet: workspace.hourlyRate > 0,
      recipesMissingBatchTime: missingBatchTime,
      ...extra,
    },
    sources: [],
  });

  if (ingredientCount === 0 && recipes.length === 0) {
    return step(
      "add_ingredients",
      "Nothing is recorded. What a bake costs is built from what its ingredients cost, so the pantry comes first.",
    );
  }
  if (recipes.length === 0) {
    return step(
      "add_recipe",
      "There are ingredients but nothing made from them, so there is no cost per bake to work out yet.",
    );
  }
  if (ingredientCount === 0) {
    return step(
      "add_ingredients",
      "There are recipes but no ingredient prices behind them, so their costs are guesses.",
    );
  }
  if (priced === 0) {
    return step("price_recipes", "Nothing has a selling price yet, so there is no margin to report.");
  }
  if (sales === 0) {
    return step(
      "record_sales",
      "Costs and prices are in, but nothing has sold, so nothing can be said about what earns or what moves.",
    );
  }
  if (sales < 10) {
    return step(
      "more_sales",
      "There is trading, but too little of it to call anything a pattern.",
    );
  }
  if (workspace.hourlyRate <= 0) {
    return step(
      "set_hourly_rate",
      "Every margin so far leaves the baker's own hours out, which is the usual reason a bake looks more profitable than it is.",
    );
  }
  if (missingBatchTime > 0) {
    return step(
      "add_batch_times",
      "The hourly rate is set but the recipes do not say how long they take, so the rate is not reaching any of them.",
      { recipesMissingBatchTime: missingBatchTime },
    );
  }
  if (workspace.events.length === 0) {
    return step(
      "plan_market",
      "Costs, prices, sales and time are all in. A market is the part Baketly can say most about, and there is not one yet.",
    );
  }
  if (!workspace.marketCheck) {
    return step(
      "run_price_check",
      "Everything is recorded except what anyone else charges, which is the missing half of any pricing question.",
    );
  }
  return step(
    "nothing_pressing",
    "The setup is complete. What is left is trading and watching what it does.",
  );
}
