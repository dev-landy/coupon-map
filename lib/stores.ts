import type { Store } from './types';

/**
 * Proximity search over stores using the haversine great-circle distance.
 * Pure and non-mutating.
 */

/** Mean Earth radius in meters (WGS-84 mean). */
const EARTH_RADIUS_METERS = 6_371_000;

/** Default search radius if a caller does not specify one. */
export const DEFAULT_RADIUS_METERS = 1000;

/** A store annotated with its distance from the query point. */
export interface StoreWithDistance extends Store {
  distanceMeters: number;
}

/**
 * Return stores within `radiusMeters` of the user, each annotated with
 * `distanceMeters`, sorted nearest-first.
 *
 * Robustness:
 *  - Skips stores whose coordinates are non-finite or out of range (bad data).
 *  - Returns [] for an empty input or when nothing is in range.
 *  - Throws on an invalid user position or radius (a programming error at the
 *    boundary, not bad row data we should silently tolerate).
 */
export function nearbyStores(
  userLat: number,
  userLng: number,
  stores: readonly Store[],
  radiusMeters: number = DEFAULT_RADIUS_METERS
): StoreWithDistance[] {
  if (!isValidCoordinate(userLat, userLng)) {
    throw new Error(`Invalid user coordinates: lat=${userLat}, lng=${userLng}`);
  }
  if (!Number.isFinite(radiusMeters) || radiusMeters < 0) {
    throw new Error(`Invalid radius: ${radiusMeters}`);
  }

  const withinRange: StoreWithDistance[] = [];
  for (const store of stores) {
    if (!isValidCoordinate(store.lat, store.lng)) continue; // skip bad rows
    const distanceMeters = haversineMeters(userLat, userLng, store.lat, store.lng);
    if (distanceMeters <= radiusMeters) {
      withinRange.push({ ...store, distanceMeters });
    }
  }

  return withinRange.sort((a, b) => a.distanceMeters - b.distanceMeters);
}

/** Great-circle distance between two lat/lng points, in meters. */
export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const lat1Rad = toRadians(lat1);
  const lat2Rad = toRadians(lat2);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_METERS * c;
}

/** True if lat/lng are finite and within valid geographic bounds. */
export function isValidCoordinate(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}
