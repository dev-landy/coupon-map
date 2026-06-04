import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { BRANDS as DEMO_BRANDS, STORES as DEMO_STORES, toBrand } from './uiData';
import type { CouponMapLoadStatus } from './frontendData';
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

interface CachedLoadState {
  envKey: string;
  state: LoadState;
  expiresAt: number;
}

interface InFlightLoadState {
  envKey: string;
  promise: Promise<LoadState>;
}

const COUPON_ROWS_CACHE_TTL_MS = 60 * 1000;
const BRAND_SELECT_COLUMNS =
  'id, source, external_id, name, app_scheme, store_url, app_store_url, updated_at, last_seen_at, created_at';
const STORE_SELECT_COLUMNS =
  'id, brand_id, source, external_id, name, lat, lng, address, updated_at, last_seen_at, created_at';
const COUPON_SELECT_COLUMNS =
  'id, brand_id, source, external_id, content_hash, title, discount_type, discount_value, valid_until, is_active, raw_payload, updated_at, last_seen_at, created_at';

let cachedLoadState: CachedLoadState | null = null;
let inFlightLoadState: InFlightLoadState | null = null;
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

export function clearCouponRowsCacheForTests() {
  cachedLoadState = null;
  inFlightLoadState = null;
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
    supabase.from('brands').select(BRAND_SELECT_COLUMNS),
    supabase.from('stores').select(STORE_SELECT_COLUMNS),
    supabase.from('coupons').select(COUPON_SELECT_COLUMNS),
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
