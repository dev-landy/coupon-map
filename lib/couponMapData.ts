import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { BRANDS as DEMO_BRANDS, STORES as DEMO_STORES, toBrand } from './uiData';
import type { CouponMapLoadStatus } from './frontendData';
import { nearbyStores } from './stores';
import type { Brand, Coupon, Store } from './types';

export interface CouponRows {
  brands: Brand[];
  stores: Store[];
  coupons: Coupon[];
}

export interface LoadState {
  rows: CouponRows;
  status: CouponMapLoadStatus;
  message: string | null;
}

export interface NearbyCouponRowsParams {
  lat: number;
  lng: number;
  radiusMeters: number;
}

interface CachedLoadState {
  envKey: string;
  state: LoadState;
  expiresAt: number;
}

interface InFlightLoadState {
  envKey: string;
  promise: Promise<LoadState>;
}

interface SupabaseRowsResult<T> {
  data: T[] | null;
  error: { message: string } | null;
}

interface SupabaseRpcResult<T> {
  data: T[] | null;
  error: { message: string } | null;
}

type StoreWithDistance = Store & {
  distanceMeters?: number;
};

type NearbyStoreRpcRow = Store & {
  distance_meters: number | null;
};

const COUPON_ROWS_CACHE_TTL_MS = 60 * 1000;
const SUPABASE_SELECT_PAGE_SIZE = 1000;
const BRAND_SELECT_COLUMNS =
  'id, source, external_id, name, app_scheme, store_url, app_store_url, updated_at, last_seen_at, created_at';
const STORE_SELECT_COLUMNS =
  'id, brand_id, source, external_id, name, lat, lng, address, updated_at, last_seen_at, created_at';
const COUPON_SELECT_COLUMNS =
  'id, brand_id, source, external_id, content_hash, title, discount_type, discount_value, valid_until, is_active, raw_payload, updated_at, last_seen_at, created_at';

let cachedLoadState: CachedLoadState | null = null;
let inFlightLoadState: InFlightLoadState | null = null;
let cachedNearbyLoadState: CachedLoadState | null = null;
let inFlightNearbyLoadState: InFlightLoadState | null = null;
let cachedSupabaseClient: {
  envKey: string;
  client: SupabaseClient;
} | null = null;

export async function loadCouponRows(): Promise<LoadState> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const envKey = `${url ?? ''}:${anonKey ?? ''}`;
  const now = Date.now();

  if (cachedLoadState?.envKey === envKey && cachedLoadState.expiresAt > now) {
    return cachedLoadState.state;
  }

  if (inFlightLoadState?.envKey === envKey) {
    return inFlightLoadState.promise;
  }

  const promise = fetchCouponRows(url, anonKey).then((state) => {
    cachedLoadState = {
      envKey,
      state,
      expiresAt: Date.now() + COUPON_ROWS_CACHE_TTL_MS,
    };
    return state;
  });

  inFlightLoadState = { envKey, promise };

  try {
    return await promise;
  } finally {
    if (inFlightLoadState?.promise === promise) {
      inFlightLoadState = null;
    }
  }
}

export async function loadCouponRowsNearLocation(
  params: NearbyCouponRowsParams
): Promise<LoadState> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const envKey = `${url ?? ''}:${anonKey ?? ''}:${params.lat}:${params.lng}:${params.radiusMeters}`;
  const now = Date.now();

  if (cachedNearbyLoadState?.envKey === envKey && cachedNearbyLoadState.expiresAt > now) {
    return cachedNearbyLoadState.state;
  }

  if (inFlightNearbyLoadState?.envKey === envKey) {
    return inFlightNearbyLoadState.promise;
  }

  const promise = fetchCouponRowsNearLocation(url, anonKey, params).then((state) => {
    cachedNearbyLoadState = {
      envKey,
      state,
      expiresAt: Date.now() + COUPON_ROWS_CACHE_TTL_MS,
    };
    return state;
  });

  inFlightNearbyLoadState = { envKey, promise };

  try {
    return await promise;
  } finally {
    if (inFlightNearbyLoadState?.promise === promise) {
      inFlightNearbyLoadState = null;
    }
  }
}

export function clearCouponRowsCacheForTests() {
  cachedLoadState = null;
  inFlightLoadState = null;
  cachedNearbyLoadState = null;
  inFlightNearbyLoadState = null;
  cachedSupabaseClient = null;
}

async function fetchCouponRows(
  url: string | undefined,
  anonKey: string | undefined
): Promise<LoadState> {
  if (!url || !anonKey) {
    if (shouldUseDemoFallback()) {
      return withDemoRows('Supabase 환경변수가 아직 설정되지 않아 샘플 쿠폰 데이터를 표시합니다.', 'missing-env');
    }

    return {
      rows: { brands: [], stores: [], coupons: [] },
      status: 'missing-env',
      message: 'Supabase 환경변수가 아직 설정되지 않았습니다.',
    };
  }

  const supabase = getCouponRowsClient(url, anonKey);

  const [brands, stores, coupons] = await Promise.all([
    fetchAllSupabaseRows<Brand>(supabase, 'brands', BRAND_SELECT_COLUMNS),
    fetchAllSupabaseRows<Store>(supabase, 'stores', STORE_SELECT_COLUMNS),
    fetchAllSupabaseRows<Coupon>(supabase, 'coupons', COUPON_SELECT_COLUMNS),
  ]);

  const error = brands.error ?? stores.error ?? coupons.error;
  if (error) {
    const message = formatSupabaseErrorMessage(error.message);

    if (shouldUseDemoFallback()) {
      return withDemoRows(`Supabase 오류가 있어 샘플 쿠폰 데이터를 표시합니다. (${message})`, 'error');
    }

    return {
      rows: { brands: [], stores: [], coupons: [] },
      status: 'error',
      message,
    };
  }

  const rows = {
    brands: (brands.data ?? []) as Brand[],
    stores: (stores.data ?? []) as Store[],
    coupons: (coupons.data ?? []) as Coupon[],
  };

  const isEmpty = rows.brands.length === 0 || rows.stores.length === 0 || rows.coupons.length === 0;
  if (isEmpty && shouldUseDemoFallback()) {
    return withDemoRows('Supabase에 표시 가능한 쿠폰 데이터가 없어 샘플 데이터를 표시합니다.', 'empty');
  }

  return {
    rows,
    status: isEmpty ? 'empty' : 'ready',
    message: isEmpty ? 'Supabase에 표시 가능한 쿠폰 데이터가 없습니다.' : null,
  };
}

async function fetchCouponRowsNearLocation(
  url: string | undefined,
  anonKey: string | undefined,
  params: NearbyCouponRowsParams
): Promise<LoadState> {
  if (!url || !anonKey) {
    const state = await fetchCouponRows(url, anonKey);
    return scopeRowsToNearbyStores(state, params);
  }

  const supabase = getCouponRowsClient(url, anonKey);

  const [brands, stores, coupons] = await Promise.all([
    fetchAllSupabaseRows<Brand>(supabase, 'brands', BRAND_SELECT_COLUMNS),
    fetchNearbyStores(supabase, params),
    fetchAllSupabaseRows<Coupon>(supabase, 'coupons', COUPON_SELECT_COLUMNS),
  ]);

  const error = brands.error ?? stores.error ?? coupons.error;
  if (error) {
    const message = formatSupabaseErrorMessage(error.message);

    if (shouldUseDemoFallback()) {
      const demoState = withDemoRows(`Supabase 오류가 있어 샘플 쿠폰 데이터를 표시합니다. (${message})`, 'error');
      return scopeRowsToNearbyStores(demoState, params);
    }

    return {
      rows: { brands: [], stores: [], coupons: [] },
      status: 'error',
      message,
    };
  }

  const nearbyRows = {
    brands: (brands.data ?? []) as Brand[],
    stores: (stores.data ?? []).map(toStoreWithDistance),
    coupons: (coupons.data ?? []) as Coupon[],
  };
  const rows = filterRowsToStoreBrands(nearbyRows);
  const isEmpty = rows.brands.length === 0 || rows.stores.length === 0 || rows.coupons.length === 0;

  if (isEmpty && shouldUseDemoFallback()) {
    const demoState = withDemoRows('Supabase에 표시 가능한 주변 쿠폰 데이터가 없어 샘플 데이터를 표시합니다.', 'empty');
    return scopeRowsToNearbyStores(demoState, params);
  }

  return {
    rows,
    status: isEmpty ? 'empty' : 'ready',
    message: isEmpty ? '현재 위치 반경에 표시 가능한 쿠폰 데이터가 없습니다.' : null,
  };
}

async function fetchAllSupabaseRows<T>(
  supabase: SupabaseClient,
  table: string,
  columns: string
): Promise<SupabaseRowsResult<T>> {
  const rows: T[] = [];

  for (let from = 0; ; from += SUPABASE_SELECT_PAGE_SIZE) {
    const to = from + SUPABASE_SELECT_PAGE_SIZE - 1;
    const result = (await supabase
      .from(table)
      .select(columns)
      .range(from, to)) as SupabaseRowsResult<T>;

    if (result.error) {
      return {
        data: null,
        error: result.error,
      };
    }

    const page = result.data ?? [];
    rows.push(...page);
    if (page.length < SUPABASE_SELECT_PAGE_SIZE) break;
  }

  return {
    data: rows,
    error: null,
  };
}

async function fetchNearbyStores(
  supabase: SupabaseClient,
  params: NearbyCouponRowsParams
): Promise<SupabaseRpcResult<NearbyStoreRpcRow>> {
  return (await supabase.rpc('nearby_stores', {
    p_lat: params.lat,
    p_lng: params.lng,
    p_radius_meters: params.radiusMeters,
  })) as SupabaseRpcResult<NearbyStoreRpcRow>;
}

function toStoreWithDistance(row: NearbyStoreRpcRow): StoreWithDistance {
  const { distance_meters: distanceMeters, ...store } = row;
  return {
    ...store,
    ...(typeof distanceMeters === 'number' && Number.isFinite(distanceMeters)
      ? { distanceMeters }
      : {}),
  };
}

function scopeRowsToNearbyStores(state: LoadState, params: NearbyCouponRowsParams): LoadState {
  const stores = nearbyStores(params.lat, params.lng, state.rows.stores, params.radiusMeters);
  return {
    ...state,
    rows: filterRowsToStoreBrands({
      ...state.rows,
      stores,
    }),
  };
}

function filterRowsToStoreBrands(rows: CouponRows): CouponRows {
  const brandIds = new Set(rows.stores.map((store) => store.brand_id));
  return {
    brands: rows.brands.filter((brand) => brandIds.has(brand.id)),
    stores: rows.stores,
    coupons: rows.coupons.filter((coupon) => brandIds.has(coupon.brand_id)),
  };
}

function getCouponRowsClient(url: string, anonKey: string): SupabaseClient {
  const envKey = `${url}:${anonKey}`;
  if (cachedSupabaseClient?.envKey === envKey) return cachedSupabaseClient.client;

  const client = createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  cachedSupabaseClient = { envKey, client };
  return client;
}

function shouldUseDemoFallback(): boolean {
  return process.env.NODE_ENV === 'development';
}

function formatSupabaseErrorMessage(message: string): string {
  if (message.includes('permission denied for table')) {
    return `${message}. Supabase SQL Editor에서 supabase/public-read-grants.sql을 실행해 public 읽기 권한을 다시 적용해주세요.`;
  }

  return message;
}

function withDemoRows(message: string, status: CouponMapLoadStatus): LoadState {
  return {
    rows: buildDemoRows(new Date()),
    status,
    message,
  };
}

function buildDemoRows(now: Date): CouponRows {
  const brands = Object.values(DEMO_BRANDS).map(toBrand);
  const stores = DEMO_STORES.map((store) => ({
    id: store.id,
    brand_id: store.brandId,
    name: store.branch,
    address: store.address,
    lat: demoLat(store.y),
    lng: demoLng(store.x),
  }));
  const coupons = DEMO_STORES.flatMap((store) =>
    store.coupons.map((coupon) => ({
      id: `${store.id}-${coupon.id}`,
      brand_id: store.brandId,
      title: coupon.name,
      discount_type: toDiscountType(coupon.kind),
      discount_value: toDiscountValue(coupon),
      valid_until: addDays(now, parseDday(coupon.until)),
      is_active: true,
      raw_payload: {
        app_link: null,
        headline: coupon.headline,
        detail_text: coupon.sub,
        order_methods: [coupon.cond],
        valid_period_text: coupon.until,
        detail: {
          headline: coupon.headline,
          detail_text: coupon.sub,
          order_methods: [coupon.cond],
          valid_period_text: coupon.until,
        },
      },
    }))
  );

  return { brands, stores, coupons };
}

function demoLat(y: number): number {
  return 37.585 - (y / 812) * 0.09;
}

function demoLng(x: number): number {
  return 126.89 + (x / 375) * 0.08;
}

function toDiscountType(kind: 'rate' | 'amount' | 'set' | 'bogo'): Coupon['discount_type'] {
  if (kind === 'rate' || kind === 'bogo') return '정률';
  if (kind === 'amount') return '정액';
  return '세트';
}

function toDiscountValue(coupon: (typeof DEMO_STORES)[number]['coupons'][number]): number {
  if (coupon.kind === 'bogo') return 50;
  const numeric = Number(coupon.headline.replace(/[^0-9]/g, ''));
  return Number.isFinite(numeric) && numeric > 0 ? numeric : coupon.rank;
}

function parseDday(label: string): number {
  const match = /^D-(\d+)$/.exec(label);
  return match ? Number(match[1]) : 30;
}

function addDays(date: Date, days: number): string {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  const yyyy = copy.getFullYear();
  const mm = `${copy.getMonth() + 1}`.padStart(2, '0');
  const dd = `${copy.getDate()}`.padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
