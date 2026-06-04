import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Brand, Coupon, Store } from '../lib/types';

const supabaseMock = vi.hoisted(() => ({
  createClient: vi.fn(),
  from: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: supabaseMock.createClient,
}));

import { clearCouponRowsCacheForTests, loadCouponRows } from '../lib/couponMapData';

const BRAND: Brand = {
  id: 'brand-1',
  source: 'test',
  external_id: 'brand-1',
  name: '맥도날드',
  app_scheme: null,
  store_url: 'https://example.com',
  app_store_url: null,
};

const STORE: Store = {
  id: 'store-1',
  brand_id: 'brand-1',
  source: 'test',
  external_id: 'store-1',
  name: '홍대점',
  lat: 37.5563,
  lng: 126.9236,
  address: '서울 마포구',
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

describe('loadCouponRows', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://coupon-map.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key');
    clearCouponRowsCacheForTests();
    supabaseMock.createClient.mockReset();
    supabaseMock.from.mockReset();
  });

  afterEach(() => {
    clearCouponRowsCacheForTests();
    vi.unstubAllEnvs();
  });

  it('caches Supabase rows briefly and selects only the fields used by the app', async () => {
    const selectColumnsByTable = setupSupabaseRows();

    const first = await loadCouponRows();
    const second = await loadCouponRows();

    expect(second).toBe(first);
    expect(supabaseMock.createClient).toHaveBeenCalledTimes(1);
    expect(supabaseMock.from).toHaveBeenCalledTimes(3);
    expect(first.rows).toEqual({
      brands: [BRAND],
      stores: [STORE],
      coupons: [COUPON],
    });
    expect(selectColumnsByTable.brands).toContain('name');
    expect(selectColumnsByTable.stores).toContain('lat');
    expect(selectColumnsByTable.coupons).toContain('raw_payload');
    expect(selectColumnsByTable.brands).not.toBe('*');
    expect(selectColumnsByTable.stores).not.toBe('*');
    expect(selectColumnsByTable.coupons).not.toBe('*');
  });
});

function setupSupabaseRows(): Record<string, string> {
  const rowsByTable = {
    brands: [BRAND],
    stores: [STORE],
    coupons: [COUPON],
  };
  const selectColumnsByTable: Record<string, string> = {};

  supabaseMock.createClient.mockReturnValue({
    from: supabaseMock.from,
  });
  supabaseMock.from.mockImplementation((table: keyof typeof rowsByTable) => ({
    select: vi.fn((columns: string) => {
      selectColumnsByTable[table] = columns;
      return Promise.resolve({
        data: rowsByTable[table],
        error: null,
      });
    }),
  }));

  return selectColumnsByTable;
}
