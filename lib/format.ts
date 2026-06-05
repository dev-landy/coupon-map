/** Shared Korean-locale formatters for radii, distances, and empty-state copy. */

export function formatRadiusLabel(radiusMeters: number): string {
  return radiusMeters >= 1000
    ? `${Number((radiusMeters / 1000).toFixed(1)).toLocaleString('ko-KR')}km`
    : `${Math.round(radiusMeters).toLocaleString('ko-KR')}m`;
}

export function formatDistanceLabel(distanceMeters: number): string {
  if (distanceMeters >= 1000) {
    return `${Number((distanceMeters / 1000).toFixed(1)).toLocaleString('ko-KR')}km`;
  }

  return `${Math.max(0, Math.round(distanceMeters)).toLocaleString('ko-KR')}m`;
}

export function formatNearbyEmptyMessage(radiusMeters: number): string {
  return `현재 위치 ${formatRadiusLabel(radiusMeters)} 반경에 표시할 쿠폰 매장이 없습니다.`;
}
