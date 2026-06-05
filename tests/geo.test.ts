import { afterEach, describe, it, expect, vi } from 'vitest';
import {
  DEFAULT_LOCATION,
  USER_LOCATION_STORAGE_TTL_MS,
  USER_LOCATION_STORAGE_KEY,
  parseStoredUserLocation,
  readStoredUserLocation,
  toCoords,
  writeStoredUserLocation,
} from '../lib/geo';

const originalLocalStorage = window.localStorage;

afterEach(() => {
  window.localStorage.removeItem?.(USER_LOCATION_STORAGE_KEY);
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: originalLocalStorage,
  });
  vi.restoreAllMocks();
});

describe('DEFAULT_LOCATION', () => {
  it('points at 홍대 center', () => {
    expect(DEFAULT_LOCATION.lat).toBe(37.5563);
    expect(DEFAULT_LOCATION.lng).toBe(126.9236);
  });

  it('is frozen so it cannot be mutated', () => {
    expect(Object.isFrozen(DEFAULT_LOCATION)).toBe(true);
  });
});

describe('toCoords', () => {
  it('extracts lat/lng from a GeolocationPosition shape', () => {
    // Arrange
    const position = {
      coords: { latitude: 37.5, longitude: 127.0 },
    } as GeolocationPosition;

    // Act
    const coords = toCoords(position);

    // Assert
    expect(coords).toEqual({ lat: 37.5, lng: 127.0 });
  });
});

describe('stored user location', () => {
  it('parses valid stored coordinates', () => {
    const now = 1_000_000;

    expect(
      parseStoredUserLocation(`{"lat":37.4979,"lng":127.0276,"savedAt":${now}}`, now)
    ).toEqual({
      lat: 37.4979,
      lng: 127.0276,
    });
  });

  it('ignores malformed and out-of-range stored coordinates', () => {
    const now = 1_000_000;

    expect(parseStoredUserLocation('not-json')).toBeNull();
    expect(parseStoredUserLocation(`{"lat":91,"lng":127.0276,"savedAt":${now}}`, now)).toBeNull();
    expect(parseStoredUserLocation(`{"lat":37.4979,"lng":181,"savedAt":${now}}`, now)).toBeNull();
  });

  it('ignores expired, future-dated, and timestamp-less stored coordinates', () => {
    const now = 1_000_000;
    const expiredSavedAt = now - USER_LOCATION_STORAGE_TTL_MS - 1;

    expect(
      parseStoredUserLocation(
        `{"lat":37.4979,"lng":127.0276,"savedAt":${expiredSavedAt}}`,
        now
      )
    ).toBeNull();
    expect(
      parseStoredUserLocation(`{"lat":37.4979,"lng":127.0276,"savedAt":${now + 1}}`, now)
    ).toBeNull();
    expect(parseStoredUserLocation('{"lat":37.4979,"lng":127.0276}', now)).toBeNull();
  });

  it('writes and reads the last browser location', () => {
    mockLocalStorage();

    writeStoredUserLocation({ lat: 37.4979, lng: 127.0276 });

    expect(readStoredUserLocation()).toEqual({ lat: 37.4979, lng: 127.0276 });
  });

  it('clears expired stored coordinates when reading storage', () => {
    mockLocalStorage();
    const now = 1_000_000;
    window.localStorage.setItem(
      USER_LOCATION_STORAGE_KEY,
      `{"lat":37.4979,"lng":127.0276,"savedAt":${now - USER_LOCATION_STORAGE_TTL_MS - 1}}`
    );

    expect(readStoredUserLocation(now)).toBeNull();
    expect(window.localStorage.getItem(USER_LOCATION_STORAGE_KEY)).toBeNull();
  });
});

function mockLocalStorage() {
  const values = new Map<string, string>();

  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => {
        values.set(key, value);
      }),
      removeItem: vi.fn((key: string) => {
        values.delete(key);
      }),
    },
  });
}
