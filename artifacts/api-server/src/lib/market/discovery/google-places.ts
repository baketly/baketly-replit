// Google Places discovery: the provider that knows websites and ratings.
//
// Optional on purpose. Without GOOGLE_PLACES_API_KEY the whole provider sits
// out and OpenStreetMap answers alone, which is how development runs. The key
// never leaves the server.
//
// Places API (New) rather than the legacy endpoint: it takes a field mask, so
// a search costs only the fields asked for, and it returns the website and
// review count the legacy nearby search leaves out.

import { bakeryId } from "../store";
import type { Bakery } from "../types";
import { normalizeBakeryName, websiteDomain } from "./index";

const ENDPOINT = "https://places.googleapis.com/v1/places:searchNearby";
const TIMEOUT_MS = 8_000;
// what a home baker competes with; Google's own type names
const INCLUDED_TYPES = ["bakery", "dessert_shop", "cake_shop", "donut_shop"];
const FIELDS = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.addressComponents",
  "places.location",
  "places.websiteUri",
  "places.rating",
  "places.userRatingCount",
].join(",");

export function googlePlacesConfigured(): boolean {
  return !!process.env.GOOGLE_PLACES_API_KEY;
}

interface AddressComponent {
  longText?: string;
  shortText?: string;
  types?: string[];
}

interface PlacesResponse {
  places?: Array<{
    id?: string;
    displayName?: { text?: string };
    formattedAddress?: string;
    addressComponents?: AddressComponent[];
    location?: { latitude?: number; longitude?: number };
    websiteUri?: string;
    rating?: number;
    userRatingCount?: number;
  }>;
}

function component(components: AddressComponent[] | undefined, type: string): string | null {
  const found = (components || []).find(
    (entry) => Array.isArray(entry?.types) && entry.types.includes(type),
  );
  return found?.longText || found?.shortText || null;
}

/** Straight-line kilometres, for ordering and for the distance shown. */
function distanceKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/**
 * Bakeries around a point, nearest first. Throws on a provider failure so the
 * caller can log it and fall back; it never returns a half-answer silently.
 */
export async function googlePlacesBakeries(
  origin: { latitude: number; longitude: number },
  radiusKm: number,
  limit: number,
): Promise<Bakery[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return [];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": FIELDS,
      },
      signal: controller.signal,
      body: JSON.stringify({
        includedTypes: INCLUDED_TYPES,
        // Google caps this at 20 per search
        maxResultCount: Math.min(20, Math.max(1, limit)),
        rankPreference: "DISTANCE",
        locationRestriction: {
          circle: {
            center: { latitude: origin.latitude, longitude: origin.longitude },
            // Google's own ceiling is 50 km
            radius: Math.min(50_000, Math.round(radiusKm * 1000)),
          },
        },
      }),
    });
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error("places " + response.status + " " + detail.slice(0, 200));
  }

  const payload = (await response.json()) as PlacesResponse;
  const now = new Date().toISOString();
  const found: Bakery[] = [];

  for (const place of payload.places ?? []) {
    const name = (place.displayName?.text || "").trim();
    if (!name) continue;
    const latitude = Number(place.location?.latitude);
    const longitude = Number(place.location?.longitude);
    const hasPoint = Number.isFinite(latitude) && Number.isFinite(longitude);
    const normalizedName = normalizeBakeryName(name);
    const website = place.websiteUri || null;
    const domain = websiteDomain(website);
    const googlePlaceId = place.id || null;
    found.push({
      id: bakeryId({ googlePlaceId, domain, normalizedName }),
      googlePlaceId,
      osmId: null,
      name: name.slice(0, 120),
      normalizedName,
      address: place.formattedAddress ? place.formattedAddress.slice(0, 200) : null,
      city:
        component(place.addressComponents, "locality") ||
        component(place.addressComponents, "postal_town"),
      region: component(place.addressComponents, "administrative_area_level_1"),
      country: component(place.addressComponents, "country"),
      latitude: hasPoint ? latitude : null,
      longitude: hasPoint ? longitude : null,
      website: website ? website.slice(0, 300) : null,
      domain,
      rating: Number.isFinite(Number(place.rating)) ? Number(place.rating) : null,
      reviewCount: Number.isFinite(Number(place.userRatingCount))
        ? Number(place.userRatingCount)
        : null,
      distanceKm: hasPoint
        ? Math.round(distanceKm(origin.latitude, origin.longitude, latitude, longitude) * 10) / 10
        : null,
      discoverySource: "google" as const,
      lastDiscoveredAt: now,
      lastScannedAt: null,
    });
  }

  return found
    .sort((a, b) => (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9))
    .slice(0, limit);
}
