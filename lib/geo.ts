'use client';

import { useCallback, useEffect, useState } from 'react';

import { DEFAULT_LOCATION, type Coords } from './location';

/**
 * Browser geolocation with a graceful fallback to 홍대 center.
 *
 * The pure helpers (DEFAULT_LOCATION, toCoords) are exported separately from
 * the React hook so they can be unit tested without a DOM/geolocation env.
 */

export { DEFAULT_LOCATION, type Coords } from './location';

export type UserLocationSource = 'default' | 'stored' | 'geolocation';

interface UserLocationState {
  coords: Coords;
  /** True when we are showing DEFAULT_LOCATION rather than a real fix. */
  usingDefault: boolean;
  /** True while the initial geolocation request is in flight. */
  isLoading: boolean;
  /** Human-readable reason we fell back, if any. */
  errorReason: string | null;
  source: UserLocationSource;
}

export interface UserLocation extends UserLocationState {
  requestCurrentLocation(): Promise<Coords | null>;
}

export const USER_LOCATION_STORAGE_KEY = 'coupon-map-user-location';
export const USER_LOCATION_STORAGE_TTL_MS = 10 * 60 * 1000;

const GEOLOCATION_OPTIONS: PositionOptions = {
  enableHighAccuracy: false,
  maximumAge: 30_000,
  timeout: 10_000,
};

interface StoredUserLocation {
  lat: number;
  lng: number;
  savedAt: number;
}

/** Pure: extract plain Coords from a GeolocationPosition. */
export function toCoords(position: GeolocationPosition): Coords {
  return {
    lat: position.coords.latitude,
    lng: position.coords.longitude,
  };
}

export function parseStoredUserLocation(value: string | null, now: number = Date.now()): Coords | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as Partial<StoredUserLocation>;
    if (!isFreshSavedAt(parsed.savedAt, now)) return null;

    const coords = {
      lat: parsed.lat,
      lng: parsed.lng,
    };
    return isValidCoords(coords) ? coords : null;
  } catch {
    return null;
  }
}

export function readStoredUserLocation(now: number = Date.now()): Coords | null {
  if (typeof window === 'undefined') return null;

  try {
    const storedValue = window.localStorage.getItem(USER_LOCATION_STORAGE_KEY);
    const coords = parseStoredUserLocation(storedValue, now);
    if (storedValue !== null && coords === null) {
      window.localStorage.removeItem(USER_LOCATION_STORAGE_KEY);
    }
    return coords;
  } catch {
    return null;
  }
}

export function writeStoredUserLocation(coords: Coords) {
  if (typeof window === 'undefined' || !isValidCoords(coords)) return;

  try {
    const payload: StoredUserLocation = {
      ...coords,
      savedAt: Date.now(),
    };
    window.localStorage.setItem(USER_LOCATION_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Storage can be disabled; location should still work for this session.
  }
}

export function clearStoredUserLocation() {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.removeItem(USER_LOCATION_STORAGE_KEY);
  } catch {
    // Storage can be disabled; clearing is best-effort only.
  }
}

/**
 * Watch the user's location on mount. On grant -> real coords; on
 * deny / unsupported / error -> DEFAULT_LOCATION with usingDefault = true.
 *
 * The hook is intentionally thin: all non-trivial logic lives in the pure
 * helpers above.
 */
export function useUserLocation(): UserLocation {
  const [state, setState] = useState<UserLocationState>(() => getInitialUserLocationState());

  const applyGeolocationCoords = useCallback((coords: Coords) => {
    writeStoredUserLocation(coords);
    setState((current) => {
      if (
        !current.isLoading &&
        current.source === 'geolocation' &&
        current.errorReason === null &&
        current.coords.lat === coords.lat &&
        current.coords.lng === coords.lng
      ) {
        return current;
      }

      return {
        coords,
        usingDefault: false,
        isLoading: false,
        errorReason: null,
        source: 'geolocation',
      };
    });
  }, []);

  const requestCurrentLocation = useCallback((): Promise<Coords | null> => {
    const geolocation =
      typeof navigator === 'undefined' ? undefined : navigator.geolocation;

    if (!geolocation?.getCurrentPosition) {
      setState((current) => ({
        ...current,
        isLoading: false,
        errorReason: 'Geolocation is not supported by this browser.',
      }));
      return Promise.resolve(null);
    }

    setState((current) => ({
      ...current,
      isLoading: true,
      errorReason: null,
    }));

    return new Promise((resolve) => {
      geolocation.getCurrentPosition(
        (position) => {
          const coords = toCoords(position);
          applyGeolocationCoords(coords);
          resolve(coords);
        },
        (error) => {
          const errorReason = error.message || 'Geolocation request failed.';
          clearStoredUserLocation();
          setState({
            coords: DEFAULT_LOCATION,
            usingDefault: true,
            isLoading: false,
            errorReason,
            source: 'default',
          });
          resolve(null);
        },
        GEOLOCATION_OPTIONS
      );
    });
  }, [applyGeolocationCoords]);

  useEffect(() => {
    const geolocation =
      typeof navigator === 'undefined' ? undefined : navigator.geolocation;
    const storedCoords = readStoredUserLocation();

    if (!geolocation?.watchPosition || !geolocation.clearWatch) {
      setState((current) => ({
        ...current,
        isLoading: false,
        errorReason: 'Geolocation is not supported by this browser.',
      }));
      return;
    }

    let isCancelled = false;
    let watchId: number | null = null;

    void getGeolocationWatchDecision(storedCoords).then((decision) => {
      if (isCancelled) return;

      if (decision === 'clear-stored') {
        clearStoredUserLocation();
        setState((current) =>
          current.source === 'stored'
            ? {
                coords: DEFAULT_LOCATION,
                usingDefault: true,
                isLoading: false,
                errorReason: 'Geolocation permission is denied.',
                source: 'default',
              }
            : current
        );
        return;
      }

      if (decision !== 'watch') return;

      watchId = geolocation.watchPosition(
        (position) => {
          if (isCancelled) return;
          applyGeolocationCoords(toCoords(position));
        },
        (error) => {
          if (isCancelled) return;
          const errorReason = error.message || 'Geolocation request failed.';
          clearStoredUserLocation();
          setState((current) => {
            if (!current.isLoading && current.source === 'geolocation') {
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
              source: 'default',
            };
          });
        },
        GEOLOCATION_OPTIONS
      );
    });

    return () => {
      isCancelled = true;
      if (watchId !== null) geolocation.clearWatch(watchId);
    };
  }, [applyGeolocationCoords]);

  return {
    ...state,
    requestCurrentLocation,
  };
}

function getInitialUserLocationState(): UserLocationState {
  const storedCoords = readStoredUserLocation();
  if (storedCoords) {
    return {
      coords: storedCoords,
      usingDefault: false,
      isLoading: false,
      errorReason: null,
      source: 'stored',
    };
  }

  return {
    coords: DEFAULT_LOCATION,
    usingDefault: true,
    isLoading: true,
    errorReason: null,
    source: 'default',
  };
}

async function getGeolocationWatchDecision(
  storedCoords: Coords | null
): Promise<'watch' | 'idle' | 'clear-stored'> {
  if (!storedCoords) return 'watch';
  if (typeof navigator === 'undefined') return 'idle';

  try {
    const permissionStatus = await navigator.permissions?.query?.({ name: 'geolocation' });
    if (!permissionStatus) return 'idle';
    if (permissionStatus.state === 'granted') return 'watch';
    if (permissionStatus.state === 'denied') return 'clear-stored';
    return 'idle';
  } catch {
    return 'idle';
  }
}

function isFreshSavedAt(savedAt: unknown, now: number): savedAt is number {
  return (
    typeof savedAt === 'number' &&
    Number.isFinite(savedAt) &&
    savedAt <= now &&
    now - savedAt <= USER_LOCATION_STORAGE_TTL_MS
  );
}

function isValidCoords(coords: Partial<Coords>): coords is Coords {
  return (
    typeof coords.lat === 'number' &&
    typeof coords.lng === 'number' &&
    Number.isFinite(coords.lat) &&
    Number.isFinite(coords.lng) &&
    coords.lat >= -90 &&
    coords.lat <= 90 &&
    coords.lng >= -180 &&
    coords.lng <= 180
  );
}
