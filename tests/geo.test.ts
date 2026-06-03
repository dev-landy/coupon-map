import { describe, it, expect } from 'vitest';
import { toCoords, DEFAULT_LOCATION } from '../lib/geo';

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
