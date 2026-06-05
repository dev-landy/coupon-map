import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Brand, Coupon, Store } from '../lib/types';

const loaderMock = vi.hoisted(() => ({
  loadCouponRowsNearLocation: vi.fn(),
}));

vi.mock('../lib/couponMapData', () => ({
  loadCouponRowsNearLocation: loaderMock.loadCouponRowsNearLocation,
}));

const { GET } = await import('../app/api/coupon-map/route');

const BRAND: Brand = {
  id: 'brand-1',
  source: 'test',
  external_id: 'brand-1',
  name: '맥도날드',
  app_scheme: null,
  store_url: 'https://example.com',
  app_store_url: null,
};

const STORE: Store & { distanceMeters: number } = {
  id: 'store-1',
  brand_id: 'brand-1',
  source: 'test',
  external_id: 'store-1',
  name: '홍대점',
  lat: 37.5563,
  lng: 126.9236,
  address: '서울 마포구',
  distanceMeters: 24.5,
};

const COUPON: Coupon = {
  id: 'coupon-1',
  brand_id: 'brand-1',
  source: 'test',
  external_id: 'coupon-1',
  title: '빅맥 20%',
  discount_type: '정률',
  discount_value: 20,
  valid_until: '2026-06-30',
  is_active: true,
  raw_payload: {
    headline: '20%',
  },
};

afterEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/coupon-map', () => {
  it('loads nearby coupon rows through the location-scoped loader', async () => {
    loaderMock.loadCouponRowsNearLocation.mockResolvedValue({
      rows: {
        brands: [BRAND],
        stores: [STORE],
        coupons: [COUPON],
      },
      status: 'ready',
      message: null,
    });

    const response = await GET(
      new Request('http://localhost/api/coupon-map?lat=37.5563&lng=126.9236&radiusMeters=1000')
    );

    expect(response.status).toBe(200);
    expect(loaderMock.loadCouponRowsNearLocation).toHaveBeenCalledWith({
      lat: 37.5563,
      lng: 126.9236,
      radiusMeters: 1000,
    });
    expect(response.headers.get('cache-control')).toBe(
      'public, max-age=0, s-maxage=60, stale-while-revalidate=240'
    );

    const body = await response.json();
    expect(body.status).toBe('ready');
    expect(body.radiusMeters).toBe(1000);
    expect(body.view.stores).toHaveLength(1);
    expect(body.view.stores[0]).toMatchObject({
      id: 'store-1',
      distanceMeters: 24.5,
      coupons: [{ id: 'coupon-1' }],
    });
  });

  it('rejects invalid coordinates before loading Supabase data', async () => {
    const response = await GET(
      new Request('http://localhost/api/coupon-map?lat=999&lng=126.9236&radiusMeters=1000')
    );

    expect(response.status).toBe(400);
    expect(loaderMock.loadCouponRowsNearLocation).not.toHaveBeenCalled();
  });
});
