// Demo commerce data, so Analytics has something to show before a baker has
// recorded any real sales.
//
// PHASE 2: delete this file and seed `saleRecords`/`eventRecords` as empty
// arrays in analytics-template.ts. It is the same "new users must start empty"
// cleanup as the hardcoded recipes in recipe-template.ts.
//
// Dates are generated relative to today, so the six-month chart is always
// populated, and the numbers come from a fixed seed so they do not jump around
// between reloads.
//
// Keep the record count modest. The whole workspace state is PUT as a single
// JSON body and express.json() rejects anything over 100KB, so a chattier demo
// would leave the app permanently unable to save.

type DemoLineItem = {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
};

type DemoSale = {
  id: string;
  occurredAt: string;
  source: "pos" | "cash" | "event";
  eventId?: string;
  total: number;
  lineItems: DemoLineItem[];
};

type DemoEvent = {
  id: string;
  name: string;
  occurredAt: string;
  boothFee: number;
  lineItems: DemoLineItem[];
};

// unitCost mirrors what each seeded recipe actually costs to make, so the
// margins Analytics reports line up with the pricing screens.
const DEMO_PRODUCTS = [
  { id: "sourdough-cheddar-loaf", name: "Sourdough Cheddar Loaf", unitPrice: 17, unitCost: 1.82, weight: 3 },
  { id: "sourdough-loaf-750g", name: "Sourdough Loaf 750g", unitPrice: 15, unitCost: 1.36, weight: 4 },
  { id: "mini-chocolate-babka", name: "Mini Chocolate Babka", unitPrice: 10, unitCost: 0.72, weight: 6 },
  { id: "mini-nutella-babka", name: "Mini Nutella Babka", unitPrice: 10, unitCost: 0.83, weight: 5 },
  { id: "focaccia-bread", name: "Focaccia Bread", unitPrice: 10, unitCost: 1.45, weight: 3 },
  { id: "big-brookie", name: "Big Brookie", unitPrice: 5, unitCost: 0.39, weight: 5 },
  { id: "big-chocolate-chip-cookie", name: "Big Chocolate Chip Cookie", unitPrice: 4, unitCost: 0.35, weight: 7 },
  { id: "big-m-and-m-cookie", name: "Big M&M Cookie", unitPrice: 4, unitCost: 0.36, weight: 4 },
  { id: "chocolate-cake-tainer", name: "Chocolate Cake-Tainer", unitPrice: 12, unitCost: 1.07, weight: 2 },
  { id: "frosting-cup", name: "Frosting Cup", unitPrice: 4, unitCost: 0.57, weight: 3 },
] as const;

const MARKET_NAMES = [
  "Base Farmers Market",
  "Harbour Craft Fair",
  "Neighbourhood Pop-Up",
  "Sunday Green Market",
  "School Bake Sale",
  "Riverside Night Market",
];

type Product = (typeof DEMO_PRODUCTS)[number];

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round2 = (value: number): number => Math.round(value * 100) / 100;

function pickProduct(rand: () => number, pool: readonly Product[]): Product {
  const total = pool.reduce((sum, product) => sum + product.weight, 0);
  let point = rand() * total;
  for (const product of pool) {
    point -= product.weight;
    if (point <= 0) return product;
  }
  return pool[pool.length - 1];
}

export function buildDemoCommerce(now: Date = new Date()): {
  sales: DemoSale[];
  events: DemoEvent[];
} {
  const rand = mulberry32(20260824);
  const sales: DemoSale[] = [];
  const events: DemoEvent[] = [];
  const monthsBack = 5;

  for (let back = monthsBack; back >= 0; back--) {
    const anchor = new Date(now.getFullYear(), now.getMonth() - back, 1);
    const year = anchor.getFullYear();
    const month = anchor.getMonth();
    const isCurrentMonth = back === 0;
    // the current month is only partly done, so stop at today
    const lastDay = isCurrentMonth
      ? now.getDate()
      : new Date(year, month + 1, 0).getDate();

    // a gentle upward trend, so the six-month chart has a shape worth reading
    const target = 800 * Math.pow(1.13, monthsBack - back) * (0.94 + rand() * 0.12);

    const eventDay = Math.min(lastDay, Math.max(1, Math.round(lastDay * 0.62)));
    const eventAt = new Date(year, month, eventDay, 10, 0, 0);
    const eventId = `event-demo-${year}-${String(month + 1).padStart(2, "0")}`;
    const eventLineItems: DemoLineItem[] = [];
    let eventRevenue = 0;
    const eventProducts = [...DEMO_PRODUCTS].sort(() => rand() - 0.5).slice(0, 5);
    for (const product of eventProducts) {
      const quantity = 5 + Math.floor(rand() * 10);
      eventLineItems.push({
        productId: product.id,
        name: product.name,
        quantity,
        unitPrice: product.unitPrice,
        unitCost: product.unitCost,
      });
      eventRevenue += quantity * product.unitPrice;
    }
    events.push({
      id: eventId,
      name: MARKET_NAMES[(monthsBack - back) % MARKET_NAMES.length],
      occurredAt: eventAt.toISOString(),
      boothFee: [95, 110, 125, 140][Math.floor(rand() * 4)],
      lineItems: eventLineItems,
    });
    sales.push({
      id: `sale-${eventId}-direct`,
      occurredAt: eventAt.toISOString(),
      source: "event",
      eventId,
      total: round2(eventRevenue),
      lineItems: eventLineItems,
    });

    // everyday orders make up the rest of the month
    let revenue = eventRevenue;
    let guard = 0;
    while (revenue < target && guard++ < 200) {
      const day = 1 + Math.floor(rand() * lastDay);
      const at = new Date(year, month, day, 9 + Math.floor(rand() * 9), rand() < 0.5 ? 0 : 30, 0);
      const lineCount = 1 + Math.floor(rand() * 3);
      const lineItems: DemoLineItem[] = [];
      const used = new Set<string>();
      let total = 0;
      for (let i = 0; i < lineCount; i++) {
        const remaining = DEMO_PRODUCTS.filter((product) => !used.has(product.id));
        const product = pickProduct(rand, remaining);
        used.add(product.id);
        const quantity = product.unitPrice >= 10 ? 1 + Math.floor(rand() * 2) : 2 + Math.floor(rand() * 5);
        lineItems.push({
          productId: product.id,
          name: product.name,
          quantity,
          unitPrice: product.unitPrice,
          unitCost: product.unitCost,
        });
        total += quantity * product.unitPrice;
      }
      sales.push({
        id: `sale-demo-${year}${String(month + 1).padStart(2, "0")}-${guard}`,
        occurredAt: at.toISOString(),
        source: rand() < 0.55 ? "pos" : "cash",
        total: round2(total),
        lineItems,
      });
      revenue += total;
    }
  }

  sales.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  return { sales, events };
}
