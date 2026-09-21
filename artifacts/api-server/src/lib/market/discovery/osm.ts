// OpenStreetMap discovery: the provider that needs no key.
//
// The lookups themselves are the ones the price check has always used, in
// lib/nearby-bakeries.ts — Photon to turn a typed place into a point, Overpass
// to find bakeries around it. This wraps them in the Bakery shape the pipeline
// expects, and keeps that module as the shared implementation rather than
// copying its query.

import { nearbyBakeriesAt, geocode, lastOverpassError } from "../../nearby-bakeries";
import { bakeryId } from "../store";
import type { Bakery } from "../types";
import { normalizeBakeryName, websiteDomain } from "./index";

export async function geocodePlace(
  place: string,
): Promise<{ latitude: number; longitude: number } | null> {
  const point = await geocode(place);
  return point ? { latitude: point.lat, longitude: point.lon } : null;
}

/** What stopped the last OSM lookup, when it came back empty. */
export function osmFailure(): string | null {
  return lastOverpassError;
}

export async function osmBakeries(
  origin: { latitude: number; longitude: number },
  radiusKm: number,
  limit: number,
): Promise<Bakery[]> {
  const found = await nearbyBakeriesAt(origin.latitude, origin.longitude, radiusKm, limit);
  const now = new Date().toISOString();
  return found.map((shop) => {
    const normalizedName = normalizeBakeryName(shop.name);
    const domain = websiteDomain(shop.website);
    const osmId = shop.osmId || null;
    return {
      id: bakeryId({ osmId, domain, normalizedName }),
      googlePlaceId: null,
      osmId,
      name: shop.name,
      normalizedName,
      address: shop.address || null,
      city: shop.town || null,
      region: null,
      country: shop.country || null,
      latitude: shop.lat ?? null,
      longitude: shop.lon ?? null,
      website: shop.website || null,
      domain,
      rating: null,
      reviewCount: null,
      distanceKm: shop.km,
      discoverySource: "osm" as const,
      lastDiscoveredAt: now,
      lastScannedAt: null,
    };
  });
}
