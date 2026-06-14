import { describe, expect, it } from 'vitest';

import {
  MAX_SCALE_RADIUS_METERS,
  MAX_SEARCH_RADIUS_METERS,
  radiusMetersForMapBounds,
  radiusMetersForMapLevel,
  radiusMetersForMapViewport,
} from '../lib/mapScale';
import { DEFAULT_RADIUS_METERS } from '../lib/stores';

class TestLatLng {
  constructor(
    private readonly lat: number,
    private readonly lng: number
  ) {}

  getLat(): number {
    return this.lat;
  }

  getLng(): number {
    return this.lng;
  }
}

function testBounds(southWest: TestLatLng, northEast: TestLatLng) {
  return {
    getNorthEast: () => northEast,
    getSouthWest: () => southWest,
  };
}

describe('radiusMetersForMapLevel', () => {
  it('uses tighter radii for closer map levels', () => {
    expect(radiusMetersForMapLevel(1)).toBe(300);
    expect(radiusMetersForMapLevel(3)).toBe(500);
    expect(radiusMetersForMapLevel(4)).toBe(1000);
  });

  it('widens the radius as the map zooms out', () => {
    expect(radiusMetersForMapLevel(5)).toBe(1500);
    expect(radiusMetersForMapLevel(6)).toBe(2500);
    expect(radiusMetersForMapLevel(7)).toBe(MAX_SCALE_RADIUS_METERS);
    expect(radiusMetersForMapLevel(12)).toBe(MAX_SCALE_RADIUS_METERS);
  });

  it('falls back to the default radius for invalid levels', () => {
    expect(radiusMetersForMapLevel(Number.NaN)).toBe(DEFAULT_RADIUS_METERS);
    expect(radiusMetersForMapLevel(Number.POSITIVE_INFINITY)).toBe(DEFAULT_RADIUS_METERS);
  });
});

describe('radiusMetersForMapBounds', () => {
  it('expands the radius to cover the visible map corners', () => {
    const radiusMeters = radiusMetersForMapBounds(
      new TestLatLng(37.5, 127),
      testBounds(new TestLatLng(37.4, 126.9), new TestLatLng(37.6, 127.1)),
      MAX_SCALE_RADIUS_METERS
    );

    expect(radiusMeters).toBeGreaterThan(MAX_SCALE_RADIUS_METERS);
    expect(radiusMeters).toBeLessThan(20_000);
  });

  it('keeps the level fallback when bounds are unavailable', () => {
    expect(
      radiusMetersForMapBounds(new TestLatLng(37.5, 127), null, MAX_SCALE_RADIUS_METERS)
    ).toBe(MAX_SCALE_RADIUS_METERS);
  });

  it('clamps extremely large bounds to the search maximum', () => {
    expect(
      radiusMetersForMapBounds(
        new TestLatLng(0, 0),
        testBounds(new TestLatLng(-80, -170), new TestLatLng(80, 170)),
        DEFAULT_RADIUS_METERS
      )
    ).toBe(MAX_SEARCH_RADIUS_METERS);
  });
});

describe('radiusMetersForMapViewport', () => {
  it('uses viewport bounds over the level fallback when the map is zoomed out', () => {
    const radiusMeters = radiusMetersForMapViewport({
      getCenter: () => new TestLatLng(37.5, 127),
      getLevel: () => 7,
      getBounds: () =>
        testBounds(new TestLatLng(37.4, 126.9), new TestLatLng(37.6, 127.1)),
    });

    expect(radiusMeters).toBeGreaterThan(MAX_SCALE_RADIUS_METERS);
  });
});
