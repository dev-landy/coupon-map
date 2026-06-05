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

type TableName = 'brands' | 'stores' | 'coupons';

interface SupabaseRangeCall {
  table: TableName;
  from: number;
  to: number;
}

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
    const { selectColumnsByTable } = setupSupabaseRows();

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

  it('loads all pages when Supabase has more rows than a single select page', async () => {
    const stores = Array.from({ length: 1001 }, (_, index) => ({
      ...STORE,
      id: `store-${index}`,
      external_id: `store-${index}`,
      name: `매장 ${index}`,
    }));
    const { rangeCalls } = setupSupabaseRows({ stores });

    const state = await loadCouponRows();

    expect(state.rows.stores).toHaveLength(1001);
    expect(state.rows.stores[0].id).toBe('store-0');
    expect(state.rows.stores[1000].id).toBe('store-1000');
    expect(rangeCalls.filter((call) => call.table === 'stores')).toEqual([
      { table: 'stores', from: 0, to: 999 },
      { table: 'stores', from: 1000, to: 1999 },
    ]);
  });
});

function setupSupabaseRows(
  overrides: Partial<{
    brands: Brand[];
    stores: Store[];
    coupons: Coupon[];
  }> = {}
): { selectColumnsByTable: Record<string, string>; rangeCalls: SupabaseRangeCall[] } {
  const rowsByTable = {
    brands: [BRAND],
    stores: [STORE],
    coupons: [COUPON],
    ...overrides,
  };
  const selectColumnsByTable: Record<string, string> = {};
  const rangeCalls: SupabaseRangeCall[] = [];

  supabaseMock.createClient.mockReturnValue({
    from: supabaseMock.from,
  });
  supabaseMock.from.mockImplementation((table: TableName) => ({
    select: vi.fn((columns: string) => {
      selectColumnsByTable[table] = columns;
      return {
        range: vi.fn((from: number, to: number) => {
          rangeCalls.push({ table, from, to });
          return Promise.resolve({
            data: rowsByTable[table].slice(from, to + 1),
            error: null,
          });
        }),
      };
    }),
  }));

  return { selectColumnsByTable, rangeCalls };
}
