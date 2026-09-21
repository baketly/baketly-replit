// Reading one bakery's website for what it sells and what it charges.
//
// The order is the point. Structured data the shop publishes about itself is
// believed first; the model is asked only about pages nothing else could read,
// and only about the page in front of it. Every product carries the URL it was
// read from, so any price on the baker's screen can be clicked and checked.
//
// A scan never throws. A shop that is down, slow, or built entirely in
// JavaScript yields nothing and the check carries on with the others.

import type { MarketLogger } from "../log";
import { competitorStore } from "../store";
import type { Bakery, CompetitorProduct, ExtractedProduct } from "../types";
import { extractWithAi } from "./ai";
import { productPageCandidates } from "./discover-pages";
import { fetchPage, fetchPages } from "./fetch";
import { extractHtml } from "./html";
import { extractJsonLd } from "./jsonld";
import {
  detectCurrency,
  detectPlatform,
  fetchShopifyProducts,
  fetchWooProducts,
} from "./platform";
import { extractProductPage, sitemapProductUrls } from "./sitemap";

/** How long a bakery's products are trusted before its site is read again. */
export const SCAN_TTL_MS = 7 * 24 * 60 * 60_000;

export interface ScanOptions {
  log: MarketLogger;
  /** absent means the model is not available; structured data still is */
  geminiApiKey?: string | null;
  localCurrency?: string | null;
  maxPages?: number;
  /** how many individual product pages to read from a sitemap */
  maxProductPages?: number;
  /** re-read even if the last scan was recent */
  force?: boolean;
}

export interface ScanResult {
  bakeryId: string;
  products: CompetitorProduct[];
  pagesDiscovered: number;
  status: "ok" | "failed" | "skipped";
  error: string | null;
}

function fresh(bakery: Bakery, force: boolean): boolean {
  if (force || !bakery.lastScannedAt) return false;
  const at = Date.parse(bakery.lastScannedAt);
  return Number.isFinite(at) && Date.now() - at < SCAN_TTL_MS;
}

/** Keep the better-sourced copy when two parsers find the same product. */
function mergeFound(groups: ExtractedProduct[][]): ExtractedProduct[] {
  const byName = new Map<string, ExtractedProduct>();
  for (const group of groups) {
    for (const product of group) {
      const existing = byName.get(product.normalizedName);
      if (!existing) {
        byName.set(product.normalizedName, product);
        continue;
      }
      const better =
        (product.price !== null ? 1 : 0) - (existing.price !== null ? 1 : 0) ||
        product.confidence - existing.confidence;
      if (better > 0) byName.set(product.normalizedName, product);
    }
  }
  return [...byName.values()];
}

/**
 * Everything one bakery's website says it sells. Returns what was stored, so
 * the caller works from the same records a later check will read from the
 * store rather than from a one-off in-memory list.
 */
export async function scanBakery(bakery: Bakery, options: ScanOptions): Promise<ScanResult> {
  const { log: parentLog } = options;
  const log = parentLog.child({ bakeryId: bakery.id, bakeryName: bakery.name });
  const startedAt = new Date().toISOString();
  const store = await competitorStore();

  if (!bakery.website) {
    log.event("BAKERY_WEBSITE_MISSING");
    return { bakeryId: bakery.id, products: [], pagesDiscovered: 0, status: "skipped", error: "no website" };
  }
  if (fresh(bakery, options.force === true)) {
    log.event("WEBSITE_SCAN_SKIPPED_FRESH", { url: bakery.website });
    const products = await store.productsFor([bakery.id]);
    return { bakeryId: bakery.id, products, pagesDiscovered: 0, status: "skipped", error: null };
  }

  log.event("WEBSITE_SCAN_STARTED", { url: bakery.website });
  const began = Date.now();

  const homepage = await fetchPage(bakery.website);
  if (!homepage.ok) {
    log.event("WEBSITE_SCAN_FAILED", { url: bakery.website, reason: homepage.error || "unreachable" });
    await store.recordScan(bakery.id, startedAt, {
      status: "failed",
      pagesDiscovered: 0,
      productsFound: 0,
      errorCode: "fetch_failed",
      errorMessage: homepage.error,
    });
    return {
      bakeryId: bakery.id,
      products: [],
      pagesDiscovered: 0,
      status: "failed",
      error: homepage.error,
    };
  }

  const groups: ExtractedProduct[][] = [];

  // ---- the platform's own catalogue, where there is one -------------------
  const platform = detectPlatform(homepage.body, homepage.finalUrl);
  const shopCurrency = detectCurrency(homepage.body) || options.localCurrency || null;
  if (platform !== "unknown") {
    log.event("ECOMMERCE_PLATFORM_DETECTED", {
      platform,
      url: homepage.finalUrl,
      currency: shopCurrency,
    });
  }
  if (platform === "shopify") {
    const products = await fetchShopifyProducts(homepage.finalUrl, 250, shopCurrency);
    if (products.length) {
      log.event("PRODUCT_EXTRACTED", {
        count: products.length,
        sourceType: "shopify",
        url: homepage.finalUrl,
      });
      groups.push(products);
    }
  } else if (platform === "woocommerce") {
    const products = await fetchWooProducts(homepage.finalUrl);
    if (products.length) {
      log.event("PRODUCT_EXTRACTED", {
        count: products.length,
        sourceType: "woocommerce",
        url: homepage.finalUrl,
      });
      groups.push(products);
    }
  }

  // ---- the pages a person would click ------------------------------------
  const candidates = productPageCandidates(
    homepage.finalUrl,
    homepage.body,
    options.maxPages ?? 5,
  );
  const pages = [
    homepage,
    ...(await fetchPages(candidates.filter((url) => url !== homepage.finalUrl))),
  ];

  for (const page of pages) {
    if (!page.ok) {
      log.event("PAGE_FETCH_FAILED", { url: page.url, reason: page.error || "unreachable" });
      continue;
    }

    const jsonLd = extractJsonLd(page.body, page.finalUrl);
    if (jsonLd.length) {
      log.event("JSONLD_PRODUCTS_FOUND", { count: jsonLd.length, url: page.finalUrl });
      groups.push(jsonLd);
      continue;
    }

    const html = extractHtml(page.body, page.finalUrl);
    if (html.length) {
      log.event("PRODUCT_EXTRACTED", {
        count: html.length,
        sourceType: html[0].sourceType,
        url: page.finalUrl,
      });
      groups.push(html);
      continue;
    }

    // Nothing deterministic could read this page. Only now, and only with the
    // page's own text, is the model asked.
    if (!options.geminiApiKey) {
      log.event("PRODUCT_REJECTED", {
        url: page.finalUrl,
        reason: "no structured data and no model configured",
      });
      continue;
    }
    log.event("AI_EXTRACTION_FALLBACK", { url: page.finalUrl });
    const ai = await extractWithAi(
      page.body,
      page.finalUrl,
      options.geminiApiKey,
      options.localCurrency ?? null,
    );
    if (ai.error) {
      log.event("AI_EXTRACTION_FAILED", { url: page.finalUrl, reason: ai.error });
      continue;
    }
    if (ai.products.length) {
      log.event("PRODUCT_EXTRACTED", {
        count: ai.products.length,
        sourceType: "ai_extraction",
        url: page.finalUrl,
        model: ai.model,
      });
      groups.push(ai.products);
    }
  }

  // ---- the shop's own index of its pages ---------------------------------
  // Sites that build their catalogue in the browser have given us nothing so
  // far. Their sitemap still names every product page, and a product page is
  // one product with one price on it.
  const foundSoFar = mergeFound(groups).filter((product) => product.price !== null).length;
  if (foundSoFar < 5) {
    const productUrls = await sitemapProductUrls(homepage.finalUrl, options.maxProductPages ?? 25);
    if (productUrls.length) {
      log.event("ECOMMERCE_PLATFORM_DETECTED", {
        platform: "sitemap",
        count: productUrls.length,
        url: homepage.finalUrl,
      });
      const productPages = await fetchPages(productUrls, 4);
      const fromSitemap: ExtractedProduct[] = [];
      for (const page of productPages) {
        if (!page.ok) {
          log.event("PAGE_FETCH_FAILED", { url: page.url, reason: page.error || "unreachable" });
          continue;
        }
        const jsonLd = extractJsonLd(page.body, page.finalUrl).filter(
          (product) => product.price !== null,
        );
        if (jsonLd.length) {
          fromSitemap.push(...jsonLd);
          continue;
        }
        const single = extractProductPage(page.body, page.finalUrl);
        if (single) fromSitemap.push(single);
      }
      if (fromSitemap.length) {
        log.event("PRODUCT_EXTRACTED", {
          count: fromSitemap.length,
          sourceType: "sitemap_product_page",
          url: homepage.finalUrl,
        });
        groups.push(fromSitemap);
      } else {
        // The pages exist and name their products; the prices are not in them.
        // Square Online and its like fetch prices into the page after it
        // loads, so there is nothing for a parser — or for a model reading the
        // same text — to find. Worth saying plainly: this shop is not missing,
        // it is unreadable without running its JavaScript.
        log.event("WEBSITE_SCAN_FAILED", {
          url: homepage.finalUrl,
          reason:
            "found " + productUrls.length + " product pages, none with a price in the HTML" +
            (platform === "unknown" ? "" : " (" + platform + " loads prices in the browser)"),
        });
      }
    }
  }

  const merged = mergeFound(groups);
  const withPrice = merged.filter((product) => {
    if (product.price === null) {
      log.event("PRODUCT_REJECTED", { productName: product.name, reason: "no price on the page" });
      return false;
    }
    return true;
  });

  let stored: CompetitorProduct[] = [];
  try {
    stored = await store.saveProducts(bakery.id, withPrice);
    await store.markScanned(bakery.id, new Date().toISOString());
  } catch (error) {
    log.event("WEBSITE_SCAN_FAILED", {
      reason: error instanceof Error ? "store: " + error.message : "store failed",
    });
  }

  await store.recordScan(bakery.id, startedAt, {
    status: "ok",
    pagesDiscovered: pages.filter((page) => page.ok).length,
    productsFound: stored.length,
  });
  log.event("WEBSITE_SCAN_COMPLETE", {
    count: stored.length,
    pages: pages.filter((page) => page.ok).length,
    ms: Date.now() - began,
  });

  return {
    bakeryId: bakery.id,
    products: stored,
    pagesDiscovered: pages.filter((page) => page.ok).length,
    status: "ok",
    error: null,
  };
}

/** Several bakeries, a few at a time, never letting one failure stop the rest. */
export async function scanBakeries(
  bakeries: Bakery[],
  options: ScanOptions & { concurrency?: number },
): Promise<ScanResult[]> {
  const concurrency = options.concurrency ?? 3;
  const results: ScanResult[] = [];
  let index = 0;
  const workers = Array.from({ length: Math.min(concurrency, bakeries.length) }, async () => {
    while (index < bakeries.length) {
      const at = index++;
      try {
        results[at] = await scanBakery(bakeries[at], options);
      } catch (error) {
        options.log.event("WEBSITE_SCAN_FAILED", {
          bakeryId: bakeries[at].id,
          reason: error instanceof Error ? error.message : "scan threw",
        });
        results[at] = {
          bakeryId: bakeries[at].id,
          products: [],
          pagesDiscovered: 0,
          status: "failed",
          error: "scan failed",
        };
      }
    }
  });
  await Promise.all(workers);
  return results;
}
