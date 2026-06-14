import { DEFAULT_RADIUS_METERS, haversineMeters, isValidCoordinate } from './stores';

export const MAX_SCALE_RADIUS_METERS = 5000;
export const MAX_SEARCH_RADIUS_METERS = 100_000;

interface MapScaleLatLng {
  getLat(): number;
  getLng(): number;
}

interface MapScaleBounds {
  getNorthEast(): MapScaleLatLng;
  getSouthWest(): MapScaleLatLng;
}

interface MapViewport {
  getBounds?: () => MapScaleBounds;
  getCenter(): MapScaleLatLng;
  getLevel(): number;
}

export function radiusMetersForMapLevel(level: number): number {
  if (!Number.isFinite(level)) return DEFAULT_RADIUS_METERS;
  if (level <= 2) return 300;
  if (level <= 3) return 500;
  if (level <= 4) return 1000;
  if (level <= 5) return 1500;
  if (level <= 6) return 2500;
  return MAX_SCALE_RADIUS_METERS;
}

export function radiusMetersForMapViewport(map: MapViewport): number {
  const fallbackRadius = radiusMetersForMapLevel(map.getLevel());

  try {
    return radiusMetersForMapBounds(map.getCenter(), map.getBounds?.(), fallbackRadius);
  } catch {
    return fallbackRadius;
  }
}

export function radiusMetersForMapBounds(
  center: MapScaleLatLng,
  bounds: MapScaleBounds | null | undefined,
  fallbackRadiusMeters: number = DEFAULT_RADIUS_METERS
): number {
  const fallbackRadius = clampSearchRadius(fallbackRadiusMeters);
  const centerCoords = readValidCoords(center);
  if (!centerCoords || !bounds) return fallbackRadius;

  const northEast = readValidCoords(bounds.getNorthEast());
  const southWest = readValidCoords(bounds.getSouthWest());
  if (!northEast || !southWest) return fallbackRadius;

  const corners = [
    northEast,
    southWest,
    { lat: northEast.lat, lng: southWest.lng },
    { lat: southWest.lat, lng: northEast.lng },
  ];
  const viewportRadiusMeters = Math.max(
    ...corners.map((corner) =>
      haversineMeters(centerCoords.lat, centerCoords.lng, corner.lat, corner.lng)
    )
  );

  return clampSearchRadius(Math.max(fallbackRadius, Math.ceil(viewportRadiusMeters)));
}

function readValidCoords(latLng: MapScaleLatLng): { lat: number; lng: number } | null {
  const lat = latLng.getLat();
  const lng = latLng.getLng();

  return isValidCoordinate(lat, lng) ? { lat, lng } : null;
}

function clampSearchRadius(radiusMeters: number): number {
  if (!Number.isFinite(radiusMeters) || radiusMeters < 0) {
    return DEFAULT_RADIUS_METERS;
  }

  return Math.min(Math.round(radiusMeters), MAX_SEARCH_RADIUS_METERS);
}
