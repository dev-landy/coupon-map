import { describe, expect, it } from 'vitest';

import { MAX_SCALE_RADIUS_METERS, radiusMetersForMapLevel } from '../lib/mapScale';
import { DEFAULT_RADIUS_METERS } from '../lib/stores';

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
