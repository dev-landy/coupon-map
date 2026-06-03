import { DEFAULT_RADIUS_METERS } from './stores';

export const MAX_SCALE_RADIUS_METERS = 5000;

export function radiusMetersForMapLevel(level: number): number {
  if (!Number.isFinite(level)) return DEFAULT_RADIUS_METERS;
  if (level <= 2) return 300;
  if (level <= 3) return 500;
  if (level <= 4) return 1000;
  if (level <= 5) return 1500;
  if (level <= 6) return 2500;
  return MAX_SCALE_RADIUS_METERS;
}
