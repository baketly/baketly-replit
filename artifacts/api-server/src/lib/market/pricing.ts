// Making two prices comparable.
//
// Six cookies for $18 and twelve for $30 are not two prices until each is
// divided by what it buys: $3.00 and $2.50 a cookie. Everything here is
// arithmetic on numbers that were read off a page. No model is involved, and
// nothing is estimated: a listing whose quantity is unknown is priced as one
// item, which is the only assumption made anywhere in this file, and it is
// recorded rather than hidden.

import type { CompetitorProduct, NormalizedProduct } from "./types";

export interface NormalizedPrice {
  /** what one item costs */
  unitPrice: number;
  /** what the competitor would charge for the baker's own quantity */
  equivalentPrice: number;
  /** per ounce and per pound, where a weight is known */
  pricePerOunce: number | null;
  pricePerPound: number | null;
  /** true when the quantity was not stated and one was assumed */
  assumedSingle: boolean;
}

const OUNCES_PER: Record<string, number> = { g: 0.035274, kg: 35.274, oz: 1, lb: 16 };

/** A weight in ounces, whatever unit it was written in. */
export function toOunces(weight: number | null, unit: string | null): number | null {
  if (weight === null || !unit) return null;
  const factor = OUNCES_PER[unit];
  if (!factor) return null;
  const ounces = weight * factor;
  return Number.isFinite(ounces) && ounces > 0 ? ounces : null;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * A competitor's listing, priced against the baker's own quantity. Returns
 * null when the listing has no usable price, which keeps it out of the market
 * rather than letting a zero or a negative through.
 */
export function normalizePrice(
  product: Pick<CompetitorProduct, "price" | "quantity" | "weight" | "weightUnit">,
  userQuantity: number,
): NormalizedPrice | null {
  const price = Number(product.price);
  if (!Number.isFinite(price) || price <= 0) return null;

  const quantity = Number(product.quantity);
  const hasQuantity = Number.isFinite(quantity) && quantity > 0;
  const perItem = hasQuantity ? price / quantity : price;
  if (!Number.isFinite(perItem) || perItem <= 0) return null;

  const wanted = Number.isFinite(userQuantity) && userQuantity > 0 ? userQuantity : 1;
  const ounces = toOunces(product.weight, product.weightUnit);
  // a weight on a listing is the weight of the whole listing
  const ouncesPerItem = ounces !== null && hasQuantity ? ounces / quantity : ounces;

  return {
    unitPrice: round(perItem),
    equivalentPrice: round(perItem * wanted),
    pricePerOunce: ouncesPerItem ? round(price / (ouncesPerItem * (hasQuantity ? quantity : 1))) : null,
    pricePerPound: ouncesPerItem
      ? round((price / (ouncesPerItem * (hasQuantity ? quantity : 1))) * 16)
      : null,
    assumedSingle: !hasQuantity,
  };
}

/** The baker's own price, read the same way, so both sides are per item. */
export function userUnitPrice(price: number, reading: NormalizedProduct): number | null {
  if (!Number.isFinite(price) || price <= 0) return null;
  const quantity = reading.quantity && reading.quantity > 0 ? reading.quantity : 1;
  return round(price / quantity);
}
