// Where competitor intelligence is kept.
//
// Postgres is the intended source of truth; the JSON file is what local
// development uses when DATABASE_URL is not set. Both implement the same
// interface, so no stage of the pipeline knows which one it is talking to.
//
// Ids are derived from what identifies a thing in the world — a Google place
// id, an OSM id, or a domain and name — rather than generated per run. That is
// what makes a JSON store and a Postgres store converge instead of doubling up
// when the same bakery is seen again, whichever one is answering.

import { createHash } from "node:crypto";
import type { Bakery, CompetitorProduct, ExtractedProduct } from "../types";

export interface ScanOutcome {
  status: "ok" | "failed" | "skipped";
  pagesDiscovered: number;
  productsFound: number;
  errorCode?: string | null;
  errorMessage?: string | null;
}

export interface CompetitorStore {
  /** Insert or refresh bakeries, returning them as stored. */
  upsertBakeries(bakeries: Bakery[]): Promise<Bakery[]>;
  /** Bakeries already known within `radiusKm` of a point. */
  bakeriesNear(latitude: number, longitude: number, radiusKm: number): Promise<Bakery[]>;
  /** Replace what a page last offered, keeping a price history entry per change. */
  saveProducts(bakeryId: string, products: ExtractedProduct[]): Promise<CompetitorProduct[]>;
  /** Everything currently on offer at these bakeries. */
  productsFor(bakeryIds: string[]): Promise<CompetitorProduct[]>;
  /** Record that a website was read, and how it went. */
  recordScan(bakeryId: string, startedAt: string, outcome: ScanOutcome): Promise<void>;
  /** For skipping bakeries scanned recently. */
  markScanned(bakeryId: string, at: string): Promise<void>;
}

function digest(value: string): string {
  return createHash("sha1").update(value).digest("hex").slice(0, 24);
}

/** Stable across providers, runs and stores. */
export function bakeryId(seed: {
  googlePlaceId?: string | null;
  osmId?: string | null;
  domain?: string | null;
  normalizedName: string;
}): string {
  if (seed.googlePlaceId) return "bk_" + digest("g:" + seed.googlePlaceId);
  if (seed.osmId) return "bk_" + digest("o:" + seed.osmId);
  if (seed.domain) return "bk_" + digest("d:" + seed.domain + ":" + seed.normalizedName);
  return "bk_" + digest("n:" + seed.normalizedName);
}

/** One product on one page of one bakery. */
export function competitorProductId(
  bakeryIdValue: string,
  sourceUrl: string,
  normalizedName: string,
): string {
  return "cp_" + digest(bakeryIdValue + "|" + sourceUrl + "|" + normalizedName);
}

export function priceHistoryId(productId: string, observedAt: string): string {
  return "ph_" + digest(productId + "|" + observedAt);
}

export function scanId(bakeryIdValue: string, startedAt: string): string {
  return "cs_" + digest(bakeryIdValue + "|" + startedAt);
}

/** Straight-line kilometres, shared by both stores. */
export function distanceKm(
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

let cached: CompetitorStore | null = null;

/**
 * Postgres when the app has a database, the JSON file when it does not.
 * Resolved once: the answer cannot change while the process runs.
 */
export async function competitorStore(): Promise<CompetitorStore> {
  if (cached) return cached;
  if (process.env.DATABASE_URL) {
    const { postgresCompetitorStore } = await import("./postgres");
    cached = postgresCompetitorStore();
  } else {
    const { jsonCompetitorStore } = await import("./json");
    cached = jsonCompetitorStore();
  }
  return cached;
}

/** Tests and scripts hand in their own. */
export function setCompetitorStore(store: CompetitorStore | null): void {
  cached = store;
}
