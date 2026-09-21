// The competitor store, in Postgres. The intended source of truth.
//
// Same ids and same behaviour as the JSON store: upserts keyed on our own
// derived ids, a history row only when a price is new or has moved, and
// products dropped from a page marked inactive rather than deleted.

import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import {
  bakeriesTable,
  competitorPriceHistoryTable,
  competitorProductsTable,
  competitorScansTable,
  db,
} from "@workspace/db";
import type { Bakery, CompetitorProduct, ExtractedProduct, SourceType } from "../types";
import {
  competitorProductId,
  distanceKm,
  priceHistoryId,
  scanId,
  type CompetitorStore,
  type ScanOutcome,
} from "./index";

type BakeryRow = typeof bakeriesTable.$inferSelect;
type ProductRow = typeof competitorProductsTable.$inferSelect;

function toBakery(row: BakeryRow, distance: number | null = null): Bakery {
  return {
    id: row.id,
    googlePlaceId: row.googlePlaceId,
    osmId: row.osmId,
    name: row.name,
    normalizedName: row.normalizedName,
    address: row.address,
    city: row.city,
    region: row.region,
    country: row.country,
    latitude: row.latitude,
    longitude: row.longitude,
    website: row.website,
    domain: row.domain,
    rating: row.rating,
    reviewCount: row.reviewCount,
    distanceKm: distance,
    discoverySource: (row.discoverySource as Bakery["discoverySource"]) || "osm",
    lastDiscoveredAt: row.lastDiscoveredAt.toISOString(),
    lastScannedAt: row.lastScannedAt ? row.lastScannedAt.toISOString() : null,
  };
}

function toProduct(row: ProductRow): CompetitorProduct {
  return {
    id: row.id,
    bakeryId: row.bakeryId,
    name: row.name,
    normalizedName: row.normalizedName,
    category: row.category,
    subcategory: row.subcategory,
    flavor: row.flavor,
    description: row.description,
    quantity: row.quantity,
    unit: row.unit,
    weight: row.weight,
    weightUnit: row.weightUnit,
    price: row.price,
    currency: row.currency,
    normalizedUnitPrice: row.normalizedUnitPrice,
    sourceUrl: row.sourceUrl,
    sourceType: row.sourceType as SourceType,
    confidence: row.confidence,
    firstSeenAt: row.firstSeenAt.toISOString(),
    lastSeenAt: row.lastSeenAt.toISOString(),
    active: row.active,
  };
}

export function postgresCompetitorStore(): CompetitorStore {
  return {
    async upsertBakeries(bakeries) {
      if (bakeries.length === 0) return [];
      const now = new Date();
      const rows = bakeries.map((bakery) => ({
        id: bakery.id,
        googlePlaceId: bakery.googlePlaceId,
        osmId: bakery.osmId,
        name: bakery.name,
        normalizedName: bakery.normalizedName,
        address: bakery.address,
        city: bakery.city,
        region: bakery.region,
        country: bakery.country,
        latitude: bakery.latitude,
        longitude: bakery.longitude,
        website: bakery.website,
        domain: bakery.domain,
        rating: bakery.rating,
        reviewCount: bakery.reviewCount,
        discoverySource: bakery.discoverySource,
        lastDiscoveredAt: now,
        updatedAt: now,
      }));
      const saved = await db
        .insert(bakeriesTable)
        .values(rows)
        .onConflictDoUpdate({
          target: bakeriesTable.id,
          set: {
            name: sql`excluded.name`,
            normalizedName: sql`excluded.normalized_name`,
            address: sql`coalesce(excluded.address, ${bakeriesTable.address})`,
            city: sql`coalesce(excluded.city, ${bakeriesTable.city})`,
            region: sql`coalesce(excluded.region, ${bakeriesTable.region})`,
            country: sql`coalesce(excluded.country, ${bakeriesTable.country})`,
            latitude: sql`coalesce(excluded.latitude, ${bakeriesTable.latitude})`,
            longitude: sql`coalesce(excluded.longitude, ${bakeriesTable.longitude})`,
            website: sql`coalesce(excluded.website, ${bakeriesTable.website})`,
            domain: sql`coalesce(excluded.domain, ${bakeriesTable.domain})`,
            rating: sql`coalesce(excluded.rating, ${bakeriesTable.rating})`,
            reviewCount: sql`coalesce(excluded.review_count, ${bakeriesTable.reviewCount})`,
            googlePlaceId: sql`coalesce(excluded.google_place_id, ${bakeriesTable.googlePlaceId})`,
            osmId: sql`coalesce(excluded.osm_id, ${bakeriesTable.osmId})`,
            discoverySource: sql`excluded.discovery_source`,
            lastDiscoveredAt: now,
            updatedAt: now,
          },
        })
        .returning();
      const distances = new Map(bakeries.map((bakery) => [bakery.id, bakery.distanceKm]));
      return saved.map((row) => toBakery(row, distances.get(row.id) ?? null));
    },

    async bakeriesNear(latitude, longitude, radiusKm) {
      // A degree of latitude is ~111 km everywhere; longitude shrinks towards
      // the poles. The box is the index-friendly first pass, and the exact
      // distance is then computed on the few rows it returns.
      const latSpan = radiusKm / 111;
      const lonSpan = radiusKm / Math.max(1, 111 * Math.cos((latitude * Math.PI) / 180));
      const rows = await db
        .select()
        .from(bakeriesTable)
        .where(
          and(
            gte(bakeriesTable.latitude, latitude - latSpan),
            lte(bakeriesTable.latitude, latitude + latSpan),
            gte(bakeriesTable.longitude, longitude - lonSpan),
            lte(bakeriesTable.longitude, longitude + lonSpan),
          ),
        )
        .limit(400);
      return rows
        .map((row) => ({
          row,
          km:
            row.latitude === null || row.longitude === null
              ? Number.POSITIVE_INFINITY
              : distanceKm(latitude, longitude, row.latitude, row.longitude),
        }))
        .filter((entry) => entry.km <= radiusKm)
        .sort((a, b) => a.km - b.km)
        .map((entry) => toBakery(entry.row, Math.round(entry.km * 10) / 10));
    },

    async saveProducts(bakeryIdValue, products: ExtractedProduct[]) {
      if (products.length === 0) return [];
      const now = new Date();
      const pages = [...new Set(products.map((product) => product.sourceUrl))];

      const rows = products.map((product) => {
        const id = competitorProductId(bakeryIdValue, product.sourceUrl, product.normalizedName);
        const normalizedUnitPrice =
          product.price !== null && product.quantity && product.quantity > 0
            ? product.price / product.quantity
            : product.price;
        return {
          id,
          bakeryId: bakeryIdValue,
          name: product.name,
          normalizedName: product.normalizedName,
          category: product.category,
          subcategory: product.subcategory,
          flavor: product.flavor,
          description: product.description,
          quantity: product.quantity,
          unit: product.unit,
          weight: product.weight,
          weightUnit: product.weightUnit,
          price: product.price,
          currency: product.currency,
          normalizedUnitPrice,
          sourceUrl: product.sourceUrl,
          sourceType: product.sourceType,
          confidence: product.confidence,
          firstSeenAt: now,
          lastSeenAt: now,
          active: true,
        };
      });

      const before = await db
        .select({ id: competitorProductsTable.id, price: competitorProductsTable.price })
        .from(competitorProductsTable)
        .where(
          inArray(
            competitorProductsTable.id,
            rows.map((row) => row.id),
          ),
        );
      const priceBefore = new Map(before.map((row) => [row.id, row.price]));

      const saved = await db
        .insert(competitorProductsTable)
        .values(rows)
        .onConflictDoUpdate({
          target: competitorProductsTable.id,
          set: {
            name: sql`excluded.name`,
            category: sql`excluded.category`,
            subcategory: sql`excluded.subcategory`,
            flavor: sql`excluded.flavor`,
            description: sql`excluded.description`,
            quantity: sql`excluded.quantity`,
            unit: sql`excluded.unit`,
            weight: sql`excluded.weight`,
            weightUnit: sql`excluded.weight_unit`,
            price: sql`excluded.price`,
            currency: sql`excluded.currency`,
            normalizedUnitPrice: sql`excluded.normalized_unit_price`,
            sourceType: sql`excluded.source_type`,
            confidence: sql`excluded.confidence`,
            lastSeenAt: now,
            active: true,
          },
        })
        .returning();

      const history = rows
        .filter((row) => row.price !== null && priceBefore.get(row.id) !== row.price)
        .map((row) => ({
          id: priceHistoryId(row.id, now.toISOString()),
          competitorProductId: row.id,
          price: row.price as number,
          normalizedUnitPrice: row.normalizedUnitPrice,
          currency: row.currency || "",
          observedAt: now,
        }));
      if (history.length) {
        await db.insert(competitorPriceHistoryTable).values(history).onConflictDoNothing();
      }

      // gone from a page we just read
      await db
        .update(competitorProductsTable)
        .set({ active: false })
        .where(
          and(
            eq(competitorProductsTable.bakeryId, bakeryIdValue),
            inArray(competitorProductsTable.sourceUrl, pages),
            sql`${competitorProductsTable.lastSeenAt} < ${now}`,
          ),
        );

      return saved.map(toProduct);
    },

    async productsFor(bakeryIds) {
      if (bakeryIds.length === 0) return [];
      const rows = await db
        .select()
        .from(competitorProductsTable)
        .where(
          and(
            inArray(competitorProductsTable.bakeryId, bakeryIds),
            eq(competitorProductsTable.active, true),
          ),
        )
        .limit(5_000);
      return rows.map(toProduct);
    },

    async recordScan(bakeryIdValue, startedAt, outcome: ScanOutcome) {
      await db
        .insert(competitorScansTable)
        .values({
          id: scanId(bakeryIdValue, startedAt),
          bakeryId: bakeryIdValue,
          startedAt: new Date(startedAt),
          completedAt: new Date(),
          status: outcome.status,
          pagesDiscovered: outcome.pagesDiscovered,
          productsFound: outcome.productsFound,
          errorCode: outcome.errorCode ?? null,
          errorMessage: outcome.errorMessage ?? null,
        })
        .onConflictDoNothing();
    },

    async markScanned(bakeryIdValue, at) {
      await db
        .update(bakeriesTable)
        .set({ lastScannedAt: new Date(at), updatedAt: new Date() })
        .where(eq(bakeriesTable.id, bakeryIdValue));
    },
  };
}
