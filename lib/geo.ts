'use client';

import { useEffect, useState } from 'react';

import { DEFAULT_LOCATION, type Coords } from './location';

/**
 * Browser geolocation with a graceful fallback to 홍대 center.
 *
 * The pure helpers (DEFAULT_LOCATION, toCoords) are exported separately from
 * the React hook so they can be unit tested without a DOM/geolocation env.
 */

export { DEFAULT_LOCATION, type Coords } from './location';

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
 * Watch the user's location on mount. On grant -> real coords; on
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
    const geolocation =
      typeof navigator === 'undefined' ? undefined : navigator.geolocation;

    if (!geolocation?.watchPosition || !geolocation.clearWatch) {
      setState({
        coords: DEFAULT_LOCATION,
        usingDefault: true,
        isLoading: false,
        errorReason: 'Geolocation is not supported by this browser.',
      });
      return;
    }

    let isCancelled = false;

    const watchId = geolocation.watchPosition(
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
        const errorReason = error.message || 'Geolocation request failed.';
        setState((current) => {
          if (!current.isLoading && !current.usingDefault) {
            return {
              ...current,
              isLoading: false,
              errorReason,
            };
          }

          return {
            coords: DEFAULT_LOCATION,
            usingDefault: true,
            isLoading: false,
            errorReason,
          };
        });
      },
      {
        enableHighAccuracy: false,
        maximumAge: 30_000,
        timeout: 10_000,
      }
    );

    return () => {
      isCancelled = true;
      geolocation.clearWatch(watchId);
    };
  }, []);

  return state;
}
