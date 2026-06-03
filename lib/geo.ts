'use client';

import { useEffect, useState } from 'react';

/**
 * Browser geolocation with a graceful fallback to 홍대 center.
 *
 * The pure helpers (DEFAULT_LOCATION, toCoords) are exported separately from
 * the React hook so they can be unit tested without a DOM/geolocation env.
 */

export interface Coords {
  lat: number;
  lng: number;
}

/** 홍대 center — the MVP's home turf and the fallback when geolocation fails. */
export const DEFAULT_LOCATION: Readonly<Coords> = Object.freeze({
  lat: 37.5563,
  lng: 126.9236,
});

export interface UserLocation {
  coords: Coords;
  /** True when we are showing DEFAULT_LOCATION rather than a real fix. */
  usingDefault: boolean;
  /** True while the initial geolocation request is in flight. */
  isLoading: boolean;
  /** Human-readable reason we fell back, if any. */
  errorReason: string | null;
}

/** Pure: extract plain Coords from a GeolocationPosition. */
export function toCoords(position: GeolocationPosition): Coords {
  return {
    lat: position.coords.latitude,
    lng: position.coords.longitude,
  };
}

/**
 * Request the user's location once on mount. On grant -> real coords; on
 * deny / unsupported / error -> DEFAULT_LOCATION with usingDefault = true.
 *
 * The hook is intentionally thin: all non-trivial logic lives in the pure
 * helpers above.
 */
export function useUserLocation(): UserLocation {
  const [state, setState] = useState<UserLocation>({
    coords: DEFAULT_LOCATION,
    usingDefault: true,
    isLoading: true,
    errorReason: null,
  });

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setState({
        coords: DEFAULT_LOCATION,
        usingDefault: true,
        isLoading: false,
        errorReason: 'Geolocation is not supported by this browser.',
      });
      return;
    }

    let isCancelled = false;

    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (isCancelled) return;
        setState({
          coords: toCoords(position),
          usingDefault: false,
          isLoading: false,
          errorReason: null,
        });
      },
      (error) => {
        if (isCancelled) return;
        setState({
          coords: DEFAULT_LOCATION,
          usingDefault: true,
          isLoading: false,
          errorReason: error.message || 'Geolocation request failed.',
        });
      }
    );

    return () => {
      isCancelled = true;
    };
  }, []);

  return state;
}
