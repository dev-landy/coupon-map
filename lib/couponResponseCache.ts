import type { CouponMapLoadStatus, CouponMapView } from './frontendData';
import type { Coords } from './location';

/** In-memory TTL cache for /api/coupon-map responses keyed by rounded center + radius. */

export interface CouponMapApiResponse {
  view: CouponMapView;
  status: CouponMapLoadStatus;
  message: string | null;
}

export interface CachedCouponMapApiResponse {
  response: CouponMapApiResponse;
  expiresAt: number;
}

export const COUPON_RELOAD_CACHE_TTL_MS = 2 * 60 * 1000;
export const COUPON_RELOAD_CACHE_MAX_ENTRIES = 40;

export function makeCouponRequestCacheKey(center: Coords, radiusMeters: number): string {
  return `${center.lat.toFixed(4)},${center.lng.toFixed(4)},${Math.round(radiusMeters)}`;
}

export function normalizeCouponRequestCenter(center: Coords): Coords {
  return {
    lat: roundCouponRequestCoordinate(center.lat),
    lng: roundCouponRequestCoordinate(center.lng),
  };
}

function roundCouponRequestCoordinate(value: number): number {
  return Number(value.toFixed(4));
}

export function readCachedCouponResponse(
  cache: Map<string, CachedCouponMapApiResponse>,
  key: string,
  now: number
): CouponMapApiResponse | null {
  const cached = cache.get(key);
  if (!cached) return null;
  if (cached.expiresAt <= now) {
    cache.delete(key);
    return null;
  }

  return cached.response;
}

export function writeCachedCouponResponse(
  cache: Map<string, CachedCouponMapApiResponse>,
  key: string,
  response: CouponMapApiResponse,
  now: number
) {
  cache.set(key, {
    response,
    expiresAt: now + COUPON_RELOAD_CACHE_TTL_MS,
  });

  while (cache.size > COUPON_RELOAD_CACHE_MAX_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (typeof oldestKey !== 'string') return;
    cache.delete(oldestKey);
  }
}
