// The competitor intelligence layer: which bakeries are near a baker, what
// they sell, and what they charged when we last looked.
//
// This is deliberately separate from workspace_state. A workspace is one
// baker's own data, saved as a blob they own. What a bakery down the road
// charges is a fact about the world: shared between bakers who sell near each
// other, worth keeping between checks, and worth keeping a history of, so that
// "three bakeries raised their cookie prices this month" can be answered later.

import {
  boolean,
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const bakeriesTable = pgTable(
  "bakeries",
  {
    id: text("id").primaryKey(),
    // whichever provider found it; either may be null, never both
    googlePlaceId: text("google_place_id"),
    osmId: text("osm_id"),
    name: text("name").notNull(),
    // lowercased, punctuation and legal suffixes stripped, for dedupe
    normalizedName: text("normalized_name").notNull(),
    address: text("address"),
    city: text("city"),
    region: text("region"),
    country: text("country"),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    website: text("website"),
    // the website's registrable host, the other half of dedupe
    domain: text("domain"),
    rating: doublePrecision("rating"),
    reviewCount: integer("review_count"),
    discoverySource: text("discovery_source").notNull(),
    lastDiscoveredAt: timestamp("last_discovered_at").notNull().defaultNow(),
    // when its website was last read for products, not when it was last found
    lastScannedAt: timestamp("last_scanned_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("bakeries_google_place_id_idx").on(table.googlePlaceId),
    uniqueIndex("bakeries_osm_id_idx").on(table.osmId),
    index("bakeries_domain_idx").on(table.domain),
    // the cheap first pass of a "what is near this point" query
    index("bakeries_location_idx").on(table.latitude, table.longitude),
  ],
);

export const competitorProductsTable = pgTable(
  "competitor_products",
  {
    id: text("id").primaryKey(),
    bakeryId: text("bakery_id")
      .notNull()
      .references(() => bakeriesTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    category: text("category"),
    subcategory: text("subcategory"),
    flavor: text("flavor"),
    description: text("description"),
    // what one listing sells: 6 pieces, 1 piece, 500 g
    quantity: doublePrecision("quantity"),
    unit: text("unit"),
    weight: doublePrecision("weight"),
    weightUnit: text("weight_unit"),
    price: doublePrecision("price"),
    currency: text("currency"),
    // price divided by quantity, so listings of different sizes compare
    normalizedUnitPrice: doublePrecision("normalized_unit_price"),
    // every price must be traceable to the page it was read from
    sourceUrl: text("source_url").notNull(),
    sourceType: text("source_type").notNull(),
    confidence: doublePrecision("confidence").notNull(),
    firstSeenAt: timestamp("first_seen_at").notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at").notNull().defaultNow(),
    // false once a scan of the same page stops returning it
    active: boolean("active").notNull().default(true),
  },
  (table) => [
    // one row per product per page, so a rescan updates rather than duplicates
    uniqueIndex("competitor_products_source_idx").on(
      table.bakeryId,
      table.sourceUrl,
      table.normalizedName,
    ),
    index("competitor_products_bakery_idx").on(table.bakeryId),
    index("competitor_products_category_idx").on(table.category, table.subcategory),
  ],
);

export const competitorPriceHistoryTable = pgTable(
  "competitor_price_history",
  {
    id: text("id").primaryKey(),
    competitorProductId: text("competitor_product_id")
      .notNull()
      .references(() => competitorProductsTable.id, { onDelete: "cascade" }),
    price: doublePrecision("price").notNull(),
    normalizedUnitPrice: doublePrecision("normalized_unit_price"),
    currency: text("currency").notNull(),
    observedAt: timestamp("observed_at").notNull().defaultNow(),
  },
  (table) => [
    index("competitor_price_history_product_idx").on(
      table.competitorProductId,
      table.observedAt,
    ),
  ],
);

// One attempt to read one bakery's website, kept whether it worked or not:
// without it, a bakery that never yields products looks the same as one that
// was never tried.
export const competitorScansTable = pgTable(
  "competitor_scans",
  {
    id: text("id").primaryKey(),
    bakeryId: text("bakery_id")
      .notNull()
      .references(() => bakeriesTable.id, { onDelete: "cascade" }),
    startedAt: timestamp("started_at").notNull().defaultNow(),
    completedAt: timestamp("completed_at"),
    status: text("status").notNull(),
    pagesDiscovered: integer("pages_discovered").notNull().default(0),
    productsFound: integer("products_found").notNull().default(0),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
  },
  (table) => [index("competitor_scans_bakery_idx").on(table.bakeryId, table.startedAt)],
);
