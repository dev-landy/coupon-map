import { describe, expect, it } from 'vitest';
import { buildCouponMapView } from '../lib/frontendData';
import type { Brand, Coupon, Store } from '../lib/types';

const NOW = new Date('2026-06-02T00:00:00+09:00');

function makeBrand(overrides: Partial<Brand> = {}): Brand {
  return {
    id: 'brand-1',
    name: '맥도날드',
    app_scheme: null,
    store_url: 'https://example.com',
    app_store_url: null,
    ...overrides,
  };
}

function makeStore(overrides: Partial<Store> = {}): Store {
  return {
    id: 'store-1',
    brand_id: 'brand-1',
    name: '홍대점',
    lat: 37.5563,
    lng: 126.9236,
    address: '서울 마포구',
    ...overrides,
  };
}

function makeCoupon(overrides: Partial<Coupon> = {}): Coupon {
  return {
    id: 'coupon-1',
    brand_id: 'brand-1',
    title: '빅맥 20%',
    discount_type: '정률',
    discount_value: 20,
    valid_until: '2026-06-30',
    is_active: true,
    ...overrides,
  };
}

describe('buildCouponMapView', () => {
  it('keeps stores with active coupons and ranks the best coupon first', () => {
    const view = buildCouponMapView(
      {
        brands: [makeBrand()],
        stores: [makeStore()],
        coupons: [
          makeCoupon({ id: 'amount', title: '1,000원 할인', discount_type: '정액', discount_value: 1000 }),
          makeCoupon({ id: 'percent', title: '30% 할인', discount_type: '정률', discount_value: 30 }),
        ],
      },
      NOW
    );

    expect(view.totals).toEqual({ brands: 1, stores: 1, activeCoupons: 2 });
    expect(view.stores).toHaveLength(1);
    expect(view.stores[0].bestCoupon).toMatchObject({
      id: 'percent',
      headline: '30%',
      validLabel: 'D-28',
    });
    expect(view.stores[0].markerX).toBe(50);
    expect(view.stores[0].markerY).toBe(50);
  });

  it('formats validity labels using Korea calendar days instead of the runtime timezone', () => {
    const view = buildCouponMapView(
      {
        brands: [makeBrand()],
        stores: [makeStore()],
        coupons: [makeCoupon({ valid_until: '2026-06-02' })],
      },
      new Date('2026-06-01T15:30:00.000Z') // 2026-06-02 00:30 in Korea
    );

    expect(view.stores[0].bestCoupon.validLabel).toBe('오늘까지');
  });

  it('summarizes rich raw_payload fields for coupon detail display', () => {
    const view = buildCouponMapView(
      {
        brands: [makeBrand()],
        stores: [makeStore()],
        coupons: [
          makeCoupon({
            raw_payload: {
              is_weekly_coupon: true,
              valid_period_text: '2026년 06월 30일까지',
              order_methods: ['킹오더', '매장'],
              product_price_krw: 10400,
              discount_amount_krw: 1300,
              payment_amount_krw: 9100,
              app_link: 'burgerkingkorea://coupon/abc',
            },
          }),
        ],
      },
      NOW
    );

    expect(view.stores[0].bestCoupon.appLink).toBe('burgerkingkorea://coupon/abc');
    expect(view.stores[0].bestCoupon.facts).toEqual([
      { label: '결제금액', value: '9,100원' },
      { label: '할인금액', value: '1,300원' },
      { label: '상품금액', value: '10,400원' },
      { label: '주문', value: '킹오더, 매장' },
      { label: '구분', value: '위클리 쿠폰' },
      { label: '유효기간', value: '2026년 06월 30일까지' },
    ]);
  });

  it('reads rich coupon fields from nested detail payloads', () => {
    const view = buildCouponMapView(
      {
        brands: [makeBrand()],
        stores: [makeStore()],
        coupons: [
          makeCoupon({
            raw_payload: {
              detail: {
                order_methods: ['매장 방문'],
                payment_amount_krw: 10900,
                app_link: 'kfc://coupon/xyz',
              },
            },
          }),
        ],
      },
      NOW
    );

    expect(view.stores[0].bestCoupon.appLink).toBe('kfc://coupon/xyz');
    expect(view.stores[0].bestCoupon.facts).toEqual([
      { label: '결제금액', value: '10,900원' },
      { label: '주문', value: '매장 방문' },
    ]);
  });

  it('filters expired, inactive, orphaned, and invalid-coordinate rows', () => {
    const view = buildCouponMapView(
      {
        brands: [makeBrand()],
        stores: [
          makeStore({ id: 'valid' }),
          makeStore({ id: 'orphan-store', brand_id: 'missing' }),
          makeStore({ id: 'bad-coords', lat: 999 }),
        ],
        coupons: [
          makeCoupon({ id: 'valid-coupon' }),
          makeCoupon({ id: 'inactive', is_active: false }),
          makeCoupon({ id: 'expired', valid_until: '2026-06-01' }),
          makeCoupon({ id: 'orphan-coupon', brand_id: 'missing' }),
        ],
      },
      NOW
    );

    expect(view.totals.activeCoupons).toBe(2);
    expect(view.stores.map((store) => store.id)).toEqual(['valid']);
    expect(view.stores[0].coupons.map((coupon) => coupon.id)).toEqual(['valid-coupon']);
  });

  it('can scope coupon stores to a radius around the current location', () => {
    const view = buildCouponMapView(
      {
        brands: [makeBrand()],
        stores: [
          makeStore({ id: 'near', lat: 37.5564, lng: 126.9236 }),
          makeStore({ id: 'far', lat: 37.58, lng: 126.9236 }),
        ],
        coupons: [makeCoupon()],
      },
      NOW,
      {
        center: { lat: 37.5563, lng: 126.9236 },
        radiusMeters: 1000,
      }
    );

    expect(view.stores.map((store) => store.id)).toEqual(['near']);
    expect(view.stores[0].distanceMeters).toBeGreaterThan(0);
    expect(view.stores[0].distanceMeters).toBeLessThan(30);
    expect(view.totals).toEqual({ brands: 1, stores: 1, activeCoupons: 1 });
  });

  it('applies active brand-wide coupons to every store for that brand only', () => {
    const view = buildCouponMapView(
      {
        brands: [
          makeBrand({ id: 'brand-1', name: '맥도날드' }),
          makeBrand({ id: 'brand-2', name: '버거킹' }),
        ],
        stores: [
          makeStore({ id: 'brand-1-store-1', brand_id: 'brand-1', name: '홍대점' }),
          makeStore({ id: 'brand-1-store-2', brand_id: 'brand-1', name: '강남점', lat: 37.4979, lng: 127.0276 }),
          makeStore({ id: 'brand-2-store-1', brand_id: 'brand-2', name: '잠실점', lat: 37.5133, lng: 127.1002 }),
        ],
        coupons: [
          makeCoupon({ id: 'brand-1-active-amount', brand_id: 'brand-1', title: '1,000원 할인', discount_type: '정액', discount_value: 1000 }),
          makeCoupon({ id: 'brand-1-active-percent', brand_id: 'brand-1', title: '20% 할인', discount_type: '정률', discount_value: 20 }),
          makeCoupon({ id: 'brand-1-inactive', brand_id: 'brand-1', is_active: false }),
          makeCoupon({ id: 'brand-2-active', brand_id: 'brand-2', title: '세트가 5,900원', discount_type: '세트', discount_value: 5900 }),
        ],
      },
      NOW
    );

    const couponsByStoreId = new Map(view.stores.map((store) => [store.id, store.coupons.map((coupon) => coupon.id)]));

    expect(couponsByStoreId.get('brand-1-store-1')).toEqual(['brand-1-active-percent', 'brand-1-active-amount']);
    expect(couponsByStoreId.get('brand-1-store-2')).toEqual(['brand-1-active-percent', 'brand-1-active-amount']);
    expect(couponsByStoreId.get('brand-2-store-1')).toEqual(['brand-2-active']);
  });

  it('returns an empty view when there is no representative coupon for a store', () => {
    const view = buildCouponMapView(
      {
        brands: [makeBrand()],
        stores: [makeStore()],
        coupons: [makeCoupon({ is_active: false })],
      },
      NOW
    );

    expect(view.stores).toEqual([]);
    expect(view.totals).toEqual({ brands: 0, stores: 0, activeCoupons: 0 });
  });
});
