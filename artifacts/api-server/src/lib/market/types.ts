// The shapes the price pipeline passes between its stages.
//
// Each stage takes the previous stage's type and returns the next, so a stage
// can be read, tested and replaced on its own. Nothing here knows which
// provider found a bakery or which parser read a price; that is what the
// source fields record.

/** A bakery near the baker, whichever provider found it. */
export interface Bakery {
  /** ours, stable across providers and runs */
  id: string;
  googlePlaceId: string | null;
  osmId: string | null;
  name: string;
  normalizedName: string;
  address: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  website: string | null;
  domain: string | null;
  rating: number | null;
  reviewCount: number | null;
  /** kilometres from the baker */
  distanceKm: number | null;
  discoverySource: "google" | "osm" | "google+osm";
  lastDiscoveredAt: string;
  lastScannedAt: string | null;
}

/** How a price was read. Anything but `ai_extraction` came from structured data. */
export type SourceType =
  | "jsonld"
  | "shopify"
  | "woocommerce"
  | "wix"
  | "square"
  | "microdata"
  | "html"
  | "ai_extraction"
  /** the old grounded-search path: never counted in market statistics */
  | "ai_search_fallback";

/** One product on one competitor's page, as read from that page. */
export interface CompetitorProduct {
  id: string;
  bakeryId: string;
  name: string;
  normalizedName: string;
  category: string | null;
  subcategory: string | null;
  flavor: string | null;
  description: string | null;
  /** how many the listing is for: 6 cookies, 1 cake */
  quantity: number | null;
  unit: string | null;
  weight: number | null;
  weightUnit: string | null;
  price: number | null;
  currency: string | null;
  /** price per single unit, once quantity is known */
  normalizedUnitPrice: number | null;
  /** the page the price was read from; never empty */
  sourceUrl: string;
  sourceType: SourceType;
  /** 0–1, how sure the extractor is that this is a real product and price */
  confidence: number;
  firstSeenAt: string;
  lastSeenAt: string;
  active: boolean;
}

/** A product before it is saved: no id, no timestamps, no bakery yet. */
export type ExtractedProduct = Omit<
  CompetitorProduct,
  "id" | "bakeryId" | "firstSeenAt" | "lastSeenAt" | "active" | "normalizedUnitPrice"
>;

/** The categories a bakery product can fall into. */
export type ProductCategory =
  | "cookie"
  | "cupcake"
  | "cake"
  | "brownie"
  | "bar"
  | "muffin"
  | "macaron"
  | "pie"
  | "cheesecake"
  | "bread"
  | "sourdough"
  | "pastry"
  | "croissant"
  | "donut"
  | "cinnamon_roll"
  | "cake_pop"
  | "dessert_box"
  | "babka"
  /** things a bakery sells that are not a bake, kept apart so they never
   *  price against one: sandwiches, drinks, gift cards */
  | "savoury"
  | "drink"
  | "not_food"
  | "unknown";

/** What a product name means, once read rather than matched as a string. */
export interface NormalizedProduct {
  category: ProductCategory;
  subcategory: string | null;
  flavor: string | null;
  /** how many items the listing is for; null when the name does not say */
  quantity: number | null;
  unit: "piece" | "slice" | "weight" | "diameter" | null;
  weight: number | null;
  weightUnit: "g" | "kg" | "oz" | "lb" | null;
  /** cake and pie sizes, in inches */
  diameterInches: number | null;
  /** mini, giant, gluten_free, vegan, assorted, tray, stuffed… */
  attributes: string[];
  /** the words the reading came from, for explaining a match */
  sourceText: string;
}

export type MatchQuality = "high" | "medium" | "low" | "rejected";

export interface MatchResult {
  matchScore: number;
  matchQuality: MatchQuality;
  reasons: string[];
  /** why it was rejected, when it was */
  rejections: string[];
}

/** A competitor product accepted into the market, priced for comparison. */
export interface ComparableProduct {
  product: CompetitorProduct;
  bakery: Bakery;
  match: MatchResult;
  /** competitor price per single item */
  unitPrice: number;
  /** what the competitor would charge for the baker's own quantity */
  equivalentPrice: number;
}

export interface MarketStats {
  comparableProducts: number;
  comparableBakeries: number;
  min: number;
  max: number;
  average: number;
  median: number;
  p25: number;
  p75: number;
  /** where the baker's own price sits, 0–100 */
  userPercentile: number;
  differenceFromMedianPercent: number;
  differenceFromAveragePercent: number;
  /** all in the baker's own quantity, so they compare with their own price */
  suggested: { competitive: number; market: number; premium: number };
  currency: string;
}
