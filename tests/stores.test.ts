import { describe, it, expect } from 'vitest';
import { nearbyStores, haversineMeters, isValidCoordinate } from '../lib/stores';
import type { Store } from '../lib/types';

// 홍대 center reference point used as the query origin.
const HONGDAE = { lat: 37.5563, lng: 126.9236 };

function makeStore(overrides: Partial<Store> = {}): Store {
  return {
    id: 's1',
    brand_id: 'b1',
    name: 'Store',
    lat: HONGDAE.lat,
    lng: HONGDAE.lng,
    address: null,
    ...overrides,
  };
}

describe('haversineMeters', () => {
  it('returns ~0 for identical points', () => {
    // Arrange / Act
    const d = haversineMeters(HONGDAE.lat, HONGDAE.lng, HONGDAE.lat, HONGDAE.lng);

    // Assert
    expect(d).toBeCloseTo(0, 5);
  });

  it('matches a known distance (~111km per degree of latitude)', () => {
    // Arrange / Act
    const d = haversineMeters(0, 0, 1, 0);

    // Assert — one degree of latitude is ~111.2 km
    expect(d).toBeGreaterThan(111_000);
    expect(d).toBeLessThan(111_400);
  });
});

describe('isValidCoordinate', () => {
  it('accepts in-range finite coordinates', () => {
    expect(isValidCoordinate(37.5, 127.0)).toBe(true);
  });

  it('rejects NaN, Infinity, and out-of-range values', () => {
    expect(isValidCoordinate(NaN, 127)).toBe(false);
    expect(isValidCoordinate(37, Infinity)).toBe(false);
    expect(isValidCoordinate(91, 0)).toBe(false);
    expect(isValidCoordinate(0, 181)).toBe(false);
  });
});

describe('nearbyStores', () => {
  it('includes stores within the radius and excludes those outside', () => {
    // Arrange — near is ~110m north, far is ~2.2km north of origin.
    const near = makeStore({ id: 'near', lat: HONGDAE.lat + 0.001, lng: HONGDAE.lng });
    const far = makeStore({ id: 'far', lat: HONGDAE.lat + 0.02, lng: HONGDAE.lng });

    // Act
    const result = nearbyStores(HONGDAE.lat, HONGDAE.lng, [near, far], 1000);

    // Assert
    expect(result.map((s) => s.id)).toEqual(['near']);
  });

  it('sorts results nearest-first and annotates distanceMeters', () => {
    // Arrange
    const closer = makeStore({ id: 'closer', lat: HONGDAE.lat + 0.001, lng: HONGDAE.lng });
    const farther = makeStore({ id: 'farther', lat: HONGDAE.lat + 0.003, lng: HONGDAE.lng });

    // Act
    const result = nearbyStores(HONGDAE.lat, HONGDAE.lng, [farther, closer], 1000);

    // Assert
    expect(result.map((s) => s.id)).toEqual(['closer', 'farther']);
    expect(result[0].distanceMeters).toBeLessThan(result[1].distanceMeters);
    expect(result[0].distanceMeters).toBeGreaterThan(0);
  });

  it('returns an empty array when nothing is in range', () => {
    // Arrange
    const far = makeStore({ id: 'far', lat: HONGDAE.lat + 0.5, lng: HONGDAE.lng });

    // Act
    const result = nearbyStores(HONGDAE.lat, HONGDAE.lng, [far], 1000);

    // Assert
    expect(result).toEqual([]);
  });

  it('returns an empty array for empty store input', () => {
    expect(nearbyStores(HONGDAE.lat, HONGDAE.lng, [], 1000)).toEqual([]);
  });

  it('skips stores with invalid/NaN coordinates rather than throwing', () => {
    // Arrange
    const good = makeStore({ id: 'good', lat: HONGDAE.lat + 0.001, lng: HONGDAE.lng });
    const nan = makeStore({ id: 'nan', lat: NaN, lng: HONGDAE.lng });
    const outOfRange = makeStore({ id: 'oob', lat: 999, lng: HONGDAE.lng });

    // Act
    const result = nearbyStores(HONGDAE.lat, HONGDAE.lng, [good, nan, outOfRange], 1000);

    // Assert
    expect(result.map((s) => s.id)).toEqual(['good']);
  });

  it('does not mutate the input stores', () => {
    // Arrange
    const store = makeStore({ id: 'x', lat: HONGDAE.lat + 0.001, lng: HONGDAE.lng });

    // Act
    nearbyStores(HONGDAE.lat, HONGDAE.lng, [store], 1000);

    // Assert — no distanceMeters leaked onto the original
    expect('distanceMeters' in store).toBe(false);
  });

  it('throws on invalid user coordinates', () => {
    expect(() => nearbyStores(NaN, HONGDAE.lng, [], 1000)).toThrow();
  });

  it('throws on a negative radius', () => {
    expect(() => nearbyStores(HONGDAE.lat, HONGDAE.lng, [], -1)).toThrow();
  });
});
