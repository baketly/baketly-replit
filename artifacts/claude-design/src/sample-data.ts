// Sample data, loaded on request from Settings.
//
// It used to be the starting state, which meant a brand new account opened onto
// somebody else's bakery: ten recipes, nine ingredients and six months of sales
// that were never theirs. New accounts now start empty and this is opt-in, so a
// baker can still fill the app to try a feature out.

import { defaultIngredientDetails } from "./ingredient-template";
import { defaultRecipes, packagingDefaults } from "./recipe-template";
import { buildDemoCommerce } from "./demo-data";

type Meta = Record<string, { name?: string; unit?: string; per?: number } | undefined>;

export type SampleWorkspace = {
  ingredientRecords: Record<string, unknown>;
  packagingRecords: Record<string, unknown>;
  recipeRecords: unknown[];
  saleRecords: unknown[];
  eventRecords: unknown[];
  sampleDataLoaded: true;
};

/**
 * Materialises the sample bakery as real records, exactly as if the baker had
 * typed them in. Names and units come from the page's own product metadata so
 * the records line up with the recipes that reference them.
 */
export function buildSampleWorkspace(
  ingredientMeta: Meta,
  packagingMeta: Meta,
): SampleWorkspace {
  const ingredientRecords: Record<string, unknown> = {};
  for (const [key, details] of Object.entries(defaultIngredientDetails)) {
    const meta = ingredientMeta[key];
    ingredientRecords[key] = {
      name: meta?.name || key,
      supplier: details.supplier,
      packagePrice: details.packagePrice,
      packageSize: details.packageSize,
      unit: details.unit,
      category: (details as { category?: string }).category ?? "other",
      kcal: details.kcal,
      protein: details.protein,
      carbs: details.carbs,
      fat: details.fat,
      sugar: 0,
    };
  }

  const packagingRecords: Record<string, unknown> = {};
  for (const [key, details] of Object.entries(packagingDefaults)) {
    const meta = packagingMeta[key];
    packagingRecords[key] = {
      name: meta?.name || details.name || key,
      supplier: details.supplier,
      packPrice: details.packPrice,
      unitsPerPack: details.unitsPerPack,
    };
  }

  const { sales, events } = buildDemoCommerce();
  return {
    ingredientRecords,
    packagingRecords,
    recipeRecords: defaultRecipes as unknown[],
    saleRecords: sales,
    eventRecords: events,
    sampleDataLoaded: true,
  };
}

/** Everything the sample fills in, emptied again. */
export function emptyWorkspace(): SampleWorkspace extends never ? never : Record<string, unknown> {
  return {
    ingredientRecords: {},
    packagingRecords: {},
    recipeRecords: [],
    saleRecords: [],
    eventRecords: [],
    removedIngredientKeys: [],
    removedPackagingKeys: [],
    priceHistory: {},
    sampleDataLoaded: false,
  };
}
