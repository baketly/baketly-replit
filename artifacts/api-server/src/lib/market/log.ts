// One market check, traceable end to end.
//
// Every stage logs the same way, with the same check id and the same event
// names, so the question "why did this bakery contribute nothing" is answered
// by filtering the log rather than by guessing. Names are stable strings: they
// are what someone greps for.

import type { Logger } from "pino";

export type MarketEvent =
  | "BAKERY_DISCOVERY_STARTED"
  | "BAKERY_DISCOVERY_GOOGLE_SUCCESS"
  | "BAKERY_DISCOVERY_GOOGLE_FAILED"
  | "BAKERY_DISCOVERY_GOOGLE_SKIPPED"
  | "BAKERY_DISCOVERY_OSM_FALLBACK"
  | "BAKERY_DISCOVERY_COMPLETE"
  | "BAKERY_DEDUPED"
  | "BAKERY_WEBSITE_MISSING"
  | "WEBSITE_SCAN_STARTED"
  | "WEBSITE_SCAN_SKIPPED_FRESH"
  | "WEBSITE_SCAN_FAILED"
  | "WEBSITE_SCAN_COMPLETE"
  | "PAGE_FETCH_FAILED"
  | "JSONLD_PRODUCTS_FOUND"
  | "ECOMMERCE_PLATFORM_DETECTED"
  | "AI_EXTRACTION_FALLBACK"
  | "AI_EXTRACTION_FAILED"
  | "PRODUCT_EXTRACTED"
  | "PRODUCT_REJECTED"
  | "PRICE_NORMALIZED"
  | "PRICE_NORMALIZATION_FAILED"
  | "MATCH_ACCEPTED"
  | "MATCH_REJECTED"
  | "MARKET_CALCULATION_COMPLETE"
  | "MARKET_CALCULATION_EMPTY"
  | "AI_EXPLANATION_COMPLETE"
  | "AI_EXPLANATION_FAILED"
  | "SEARCH_FALLBACK_USED";

/** Fields worth carrying on any event, so one check can be followed through. */
export interface MarketLogFields {
  checkId?: string;
  bakeryId?: string;
  bakeryName?: string;
  productName?: string;
  url?: string;
  sourceType?: string;
  count?: number;
  score?: number;
  reason?: string;
  ms?: number;
  [key: string]: unknown;
}

export interface MarketLogger {
  readonly checkId: string;
  event(name: MarketEvent, fields?: MarketLogFields): void;
  /** a logger that carries these fields on every later event */
  child(fields: MarketLogFields): MarketLogger;
}

function make(base: Logger, checkId: string, bound: MarketLogFields): MarketLogger {
  return {
    checkId,
    event(name, fields) {
      const payload = { checkId, event: name, ...bound, ...(fields || {}) };
      // Failures are the ones worth seeing in a quiet log; the rest is trace.
      if (name.endsWith("_FAILED") || name.endsWith("_REJECTED")) base.warn(payload, name);
      else base.info(payload, name);
    },
    child(fields) {
      return make(base, checkId, { ...bound, ...fields });
    },
  };
}

export function marketLogger(base: Logger, checkId?: string): MarketLogger {
  return make(base, checkId || "chk_" + Math.random().toString(36).slice(2, 10), {});
}
