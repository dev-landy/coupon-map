import { NextResponse } from 'next/server';

import { loadCouponRows } from '../../../lib/couponMapData';
import { buildCouponMapView, type CouponMapLoadStatus } from '../../../lib/frontendData';
import { MAX_SCALE_RADIUS_METERS } from '../../../lib/mapScale';
import { DEFAULT_RADIUS_METERS, isValidCoordinate } from '../../../lib/stores';

export const revalidate = 60;

const COUPON_API_CACHE_CONTROL =
  'public, max-age=0, s-maxage=60, stale-while-revalidate=240';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const lat = parseNumberParam(url.searchParams.get('lat'));
  const lng = parseNumberParam(url.searchParams.get('lng'));
  const radiusMeters = parseRadiusMeters(url.searchParams.get('radiusMeters'));

  if (lat === null || lng === null || !isValidCoordinate(lat, lng)) {
    return NextResponse.json(
      { message: 'lat/lng query parameters must be valid coordinates.' },
      { status: 400 }
    );
  }

  if (radiusMeters === null) {
    return NextResponse.json(
      { message: `radiusMeters must be between 0 and ${MAX_SCALE_RADIUS_METERS}.` },
      { status: 400 }
    );
  }

  const state = await loadCouponRows();
  const view = buildCouponMapView(state.rows, new Date(), {
    center: { lat, lng },
    radiusMeters,
  });
  const status = resolveStatus(state.status, view.stores.length);
  const message =
    state.message ?? (view.stores.length === 0 ? formatNearbyEmptyMessage(radiusMeters) : null);

  return NextResponse.json(
    {
      view,
      status,
      message,
      radiusMeters,
    },
    {
      headers: {
        'Cache-Control': COUPON_API_CACHE_CONTROL,
      },
    }
  );
}

function parseNumberParam(value: string | null): number | null {
  if (value === null || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseRadiusMeters(value: string | null): number | null {
  const parsed = value === null || value.trim() === '' ? DEFAULT_RADIUS_METERS : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > MAX_SCALE_RADIUS_METERS) return null;
  return parsed;
}

function resolveStatus(baseStatus: CouponMapLoadStatus, storeCount: number): CouponMapLoadStatus {
  if (baseStatus === 'ready' && storeCount === 0) return 'empty';
  return baseStatus;
}

function formatNearbyEmptyMessage(radiusMeters: number): string {
  return `현재 위치 ${formatRadiusLabel(radiusMeters)} 반경에 표시할 쿠폰 매장이 없습니다.`;
}

function formatRadiusLabel(radiusMeters: number): string {
  return radiusMeters >= 1000
    ? `${Number((radiusMeters / 1000).toFixed(1)).toLocaleString('ko-KR')}km`
    : `${Math.round(radiusMeters).toLocaleString('ko-KR')}m`;
}
