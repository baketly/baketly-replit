// What to ask next.
//
// Decided from what the baker actually has rather than by asking a model to
// invent prompts: a baker with two markets on record is offered a comparison,
// one with an underpriced product is offered that, and one with nothing yet is
// offered the questions that teach them the app. No tokens, no latency, and
// every suggestion is answerable.

import { pastEvents, productProfit } from "./metrics";
import type { Workspace } from "./workspace";

export function suggestedQuestions(workspace: Workspace): string[] {
  const suggestions: string[] = [];
  const events = pastEvents(workspace);
  const hasSales = workspace.sales.length > 0;
  const recipes = workspace.recipes;

  // Nothing entered yet: the useful questions are about the app itself.
  if (recipes.length === 0 && !hasSales) {
    return [
      "What can Baketly do for me?",
      "What should I add first?",
      "How should I price what I bake?",
    ];
  }

  if (events.length >= 2) {
    suggestions.push("Compare my last two events.");
    suggestions.push("Which event was most profitable?");
  } else if (events.length === 1) {
    suggestions.push("Was " + (events[0].name || "my last market") + " worth doing?");
  }

  if (recipes.length >= 2 && hasSales) {
    suggestions.push("Which product makes me the most money?");
  }
  if (recipes.length >= 1) {
    suggestions.push("Which product has my best margin?");
  }

  // A market check with a product below the local median is the most useful
  // thing we can offer, so it goes near the front.
  const marketProducts = Array.isArray(
    (workspace.marketCheck as { products?: unknown } | null)?.products,
  )
    ? ((workspace.marketCheck as { products?: unknown }).products as Array<{
        name?: string;
        provenance?: string;
        differenceFromMedianPercent?: number | null;
      }>)
    : [];
  const underpriced = marketProducts
    .filter(
      (entry) =>
        entry.provenance === "verified" &&
        typeof entry.differenceFromMedianPercent === "number" &&
        entry.differenceFromMedianPercent < -5,
    )
    .sort(
      (a, b) => (a.differenceFromMedianPercent ?? 0) - (b.differenceFromMedianPercent ?? 0),
    );
  if (underpriced.length) {
    suggestions.unshift("Am I charging enough for my " + (underpriced[0].name || "products") + "?");
  } else if (marketProducts.length) {
    suggestions.push("Which of my products are underpriced nearby?");
  }

  if (hasSales) {
    suggestions.push("How am I doing this month?");
    suggestions.push("What changed compared with last month?");
  }

  // A price question is only worth offering once a product has a price.
  const priced = recipes.find((recipe) => Number(recipe.price) > 0);
  if (priced && hasSales) {
    suggestions.push("What happens if I raise " + priced.name + " by $2?");
  }

  if (workspace.hourlyRate === 0 && recipes.length > 0) {
    suggestions.push("What is my time worth in these prices?");
  }

  // A margin worth worrying about beats a generic prompt.
  const thin = recipes
    .map((recipe) => productProfit(recipe, workspace))
    .filter((profit) => profit.sellingPrice > 0 && profit.marginPercent < 40)
    .sort((a, b) => a.marginPercent - b.marginPercent)[0];
  if (thin) suggestions.push("Why is my margin thin on " + thin.name + "?");

  return [...new Set(suggestions)].slice(0, 4);
}
