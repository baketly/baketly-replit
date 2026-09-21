// The competitor store, in a file.
//
// For development, and for any deployment without a database. It holds the
// same records under the same ids as the Postgres store, so a workspace that
// starts here and later gets a DATABASE_URL re-learns the same bakeries rather
// than gaining a second copy of each.
//
// Writes are debounced: a scan saves a few hundred products in a burst, and
// the file is small enough to rewrite whole.

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Bakery, CompetitorProduct, ExtractedProduct } from "../types";
import {
  competitorProductId,
  distanceKm,
  priceHistoryId,
  scanId,
  type CompetitorStore,
  type ScanOutcome,
} from "./index";

interface PriceHistoryRow {
  id: string;
  competitorProductId: string;
  price: number;
  normalizedUnitPrice: number | null;
  currency: string;
  observedAt: string;
}

interface ScanRow {
  id: string;
  bakeryId: string;
  startedAt: string;
  completedAt: string;
  status: string;
  pagesDiscovered: number;
  productsFound: number;
  errorCode: string | null;
  errorMessage: string | null;
}

interface FileShape {
  version: 1;
  bakeries: Record<string, Bakery>;
  products: Record<string, CompetitorProduct>;
  priceHistory: PriceHistoryRow[];
  scans: ScanRow[];
}

const MAX_HISTORY = 20_000;
const MAX_SCANS = 2_000;
const WRITE_DELAY_MS = 400;

function emptyFile(): FileShape {
  return { version: 1, bakeries: {}, products: {}, priceHistory: [], scans: [] };
}

export function jsonCompetitorStore(): CompetitorStore {
  const path =
    process.env.MARKET_DATA_FILE ||
    join(process.cwd(), "data", "competitor-intelligence.json");

  let data: FileShape | null = null;
  let loading: Promise<FileShape> | null = null;
  let writeTimer: NodeJS.Timeout | null = null;
  let writing: Promise<void> = Promise.resolve();

  async function load(): Promise<FileShape> {
    if (data) return data;
    if (!loading) {
      loading = (async () => {
        try {
          const raw = await readFile(path, "utf8");
          const parsed = JSON.parse(raw) as Partial<FileShape>;
          data = {
            version: 1,
            bakeries: parsed.bakeries || {},
            products: parsed.products || {},
            priceHistory: parsed.priceHistory || [],
            scans: parsed.scans || [],
          };
        } catch {
          // A missing or unreadable file is an empty one: losing a cache costs
          // a rescan, never the check itself.
          data = emptyFile();
        }
        return data;
      })();
    }
    return loading;
  }

  function schedule(): void {
    if (writeTimer) return;
    writeTimer = setTimeout(() => {
      writeTimer = null;
      writing = writing.then(async () => {
        if (!data) return;
        const snapshot = JSON.stringify(data);
        try {
          await mkdir(dirname(path), { recursive: true });
          // written beside and moved, so a crash mid-write cannot truncate it
          const temporary = path + ".tmp";
          await writeFile(temporary, snapshot, "utf8");
          await rename(temporary, path);
        } catch {
          // Losing the cache is survivable; failing the check is not.
        }
      });
    }, WRITE_DELAY_MS);
    // never hold the process open for a cache write
    writeTimer.unref?.();
  }

  return {
    async upsertBakeries(bakeries) {
      const file = await load();
      const now = new Date().toISOString();
      const saved: Bakery[] = [];
      for (const bakery of bakeries) {
        const existing = file.bakeries[bakery.id];
        const merged: Bakery = {
          ...(existing || {}),
          ...bakery,
          // discovery never knows when a website was last read
          lastScannedAt: existing?.lastScannedAt ?? bakery.lastScannedAt ?? null,
          lastDiscoveredAt: now,
        };
        file.bakeries[bakery.id] = merged;
        saved.push(merged);
      }
      schedule();
      return saved;
    },

    async bakeriesNear(latitude, longitude, radiusKm) {
      const file = await load();
      return Object.values(file.bakeries)
        .map((bakery) => ({
          bakery,
          km:
            bakery.latitude === null || bakery.longitude === null
              ? Number.POSITIVE_INFINITY
              : distanceKm(latitude, longitude, bakery.latitude, bakery.longitude),
        }))
        .filter((entry) => entry.km <= radiusKm)
        .sort((a, b) => a.km - b.km)
        .map((entry) => ({ ...entry.bakery, distanceKm: Math.round(entry.km * 10) / 10 }));
    },

    async saveProducts(bakeryIdValue, products) {
      const file = await load();
      const now = new Date().toISOString();
      const saved: CompetitorProduct[] = [];
      const seenIds = new Set<string>();
      const pagesTouched = new Set<string>();

      for (const product of products) {
        const id = competitorProductId(bakeryIdValue, product.sourceUrl, product.normalizedName);
        seenIds.add(id);
        pagesTouched.add(product.sourceUrl);
        const existing = file.products[id];
        const row: CompetitorProduct = {
          ...product,
          id,
          bakeryId: bakeryIdValue,
          normalizedUnitPrice:
            product.price !== null && product.quantity && product.quantity > 0
              ? product.price / product.quantity
              : product.price,
          firstSeenAt: existing?.firstSeenAt || now,
          lastSeenAt: now,
          active: true,
        };
        // A price is only worth a history row when it is new or has moved.
        if (row.price !== null && (!existing || existing.price !== row.price)) {
          file.priceHistory.push({
            id: priceHistoryId(id, now),
            competitorProductId: id,
            price: row.price,
            normalizedUnitPrice: row.normalizedUnitPrice,
            currency: row.currency || "",
            observedAt: now,
          });
        }
        file.products[id] = row;
        saved.push(row);
      }

      // Something that was on a page we just read, and is no longer on it, has
      // been taken down: kept for history, dropped from the market.
      for (const row of Object.values(file.products)) {
        if (row.bakeryId !== bakeryIdValue) continue;
        if (!pagesTouched.has(row.sourceUrl)) continue;
        if (seenIds.has(row.id)) continue;
        row.active = false;
      }

      if (file.priceHistory.length > MAX_HISTORY) {
        file.priceHistory.splice(0, file.priceHistory.length - MAX_HISTORY);
      }
      schedule();
      return saved;
    },

    async productsFor(bakeryIds) {
      const file = await load();
      const wanted = new Set(bakeryIds);
      return Object.values(file.products).filter(
        (product) => product.active && wanted.has(product.bakeryId),
      );
    },

    async recordScan(bakeryIdValue, startedAt, outcome: ScanOutcome) {
      const file = await load();
      file.scans.push({
        id: scanId(bakeryIdValue, startedAt),
        bakeryId: bakeryIdValue,
        startedAt,
        completedAt: new Date().toISOString(),
        status: outcome.status,
        pagesDiscovered: outcome.pagesDiscovered,
        productsFound: outcome.productsFound,
        errorCode: outcome.errorCode ?? null,
        errorMessage: outcome.errorMessage ?? null,
      });
      if (file.scans.length > MAX_SCANS) {
        file.scans.splice(0, file.scans.length - MAX_SCANS);
      }
      schedule();
    },

    async markScanned(bakeryIdValue, at) {
      const file = await load();
      const bakery = file.bakeries[bakeryIdValue];
      if (bakery) {
        bakery.lastScannedAt = at;
        schedule();
      }
    },
  };
}
