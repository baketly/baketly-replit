// The bakeries the evaluation asks about.
//
// Fixed, so two runs are comparable, and shaped like the ones bakers actually
// have on the day they first open the chat: nothing, a recipe, a few sales, a
// month of trading. Most of what the chat got wrong, it got wrong on the thin
// ones.

const flour = {
  name: "Bread flour",
  supplier: "Costco",
  packagePrice: 12.99,
  packageSize: 10000,
  unit: "g",
  kcal: 364,
  protein: 12,
  carbs: 76,
  fat: 1,
};

const butter = {
  name: "Butter",
  supplier: "Costco",
  packagePrice: 4.28,
  packageSize: 454,
  unit: "g",
  kcal: 717,
  protein: 1,
  carbs: 0,
  fat: 81,
};

const vanilla = {
  name: "Vanilla paste",
  supplier: "The deli",
  packagePrice: 38.0,
  packageSize: 100,
  unit: "ml",
  kcal: 288,
  protein: 0,
  carbs: 13,
  fat: 0,
};

const sourdough = {
  id: "r-sourdough",
  name: "Sourdough Loaf",
  type: "Bread",
  icon: "loaf",
  price: 9,
  yield: 4,
  ingredientKeys: ["flour", "butter"],
  packagingKeys: [],
  amounts: { flour: 2000, butter: 100 },
};

const babka = {
  id: "r-babka",
  name: "Chocolate Babka",
  type: "Babka",
  icon: "babka",
  price: 14,
  yield: 6,
  ingredientKeys: ["flour", "butter", "vanilla"],
  packagingKeys: [],
  amounts: { flour: 1200, butter: 400, vanilla: 4 },
};

function sales(count, product, unitPrice, unitCost, spreadDays) {
  return Array.from({ length: count }, (_, i) => ({
    id: `sale-${product.id}-${i}`,
    occurredAt: new Date(Date.now() - (i % spreadDays) * 86400000).toISOString(),
    source: "pos",
    total: unitPrice,
    lineItems: [
      { productId: product.id, name: product.name, quantity: 1, unitPrice, unitCost },
    ],
  }));
}

export const BAKERIES = {
  empty: {
    label: "nothing recorded at all",
    state: {},
  },

  recipeNoSales: {
    label: "one recipe, costed and priced, nothing sold",
    state: {
      ingredientRecords: { flour, butter },
      recipeRecords: [sourdough],
    },
  },

  threeSales: {
    label: "one recipe and three sales",
    state: {
      ingredientRecords: { flour, butter },
      recipeRecords: [sourdough],
      saleRecords: sales(3, sourdough, 9, 2.7, 5),
    },
  },

  // An hourly rate with no batch times on the recipes: the rate reaches
  // nothing, which is the case the chat used to get backwards.
  rateNoMinutes: {
    label: "a month of trading, hourly rate set, no batch times",
    state: {
      ingredientRecords: { flour, butter, vanilla },
      recipeRecords: [sourdough, babka],
      saleRecords: [...sales(40, sourdough, 9, 2.7, 28), ...sales(18, babka, 14, 4.1, 28)],
      hourlyRate: 15,
    },
  },

  // Everything in, including time, so nothing should be hedged about hours.
  fullyCosted: {
    label: "a month of trading with time fully costed",
    state: {
      ingredientRecords: { flour, butter, vanilla },
      recipeRecords: [
        { ...sourdough, activeMinutes: 40 },
        { ...babka, activeMinutes: 90 },
      ],
      saleRecords: [...sales(40, sourdough, 9, 2.7, 28), ...sales(18, babka, 14, 4.1, 28)],
      hourlyRate: 15,
    },
  },
};
