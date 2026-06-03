import { buildCouponMapView } from '../lib/frontendData';
import { loadCouponRows } from '../lib/couponMapData';
import { DEFAULT_LOCATION } from '../lib/location';
import { DEFAULT_RADIUS_METERS } from '../lib/stores';
import CouponMapScreen from './CouponMapScreen';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const state = await loadCouponRows();
  const view = buildCouponMapView(state.rows, new Date(), {
    center: DEFAULT_LOCATION,
    radiusMeters: DEFAULT_RADIUS_METERS,
  });
  const status = state.status === 'ready' && view.stores.length === 0 ? 'empty' : state.status;
  const message =
    state.message ??
    (view.stores.length === 0 ? formatNearbyEmptyMessage(DEFAULT_RADIUS_METERS) : null);

  return <CouponMapScreen view={view} status={status} message={message} />;
}

function formatNearbyEmptyMessage(radiusMeters: number): string {
  return `현재 위치 ${formatRadiusLabel(radiusMeters)} 반경에 표시할 쿠폰 매장이 없습니다.`;
}

function formatRadiusLabel(radiusMeters: number): string {
  return radiusMeters >= 1000
    ? `${Number((radiusMeters / 1000).toFixed(1)).toLocaleString('ko-KR')}km`
    : `${Math.round(radiusMeters).toLocaleString('ko-KR')}m`;
}
