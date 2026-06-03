import { createClient } from '@supabase/supabase-js';

import CouponMapScreen, { type CouponMapLoadStatus } from './CouponMapScreen';
import { buildCouponMapView } from '../lib/frontendData';
import { BRANDS as DEMO_BRANDS, STORES as DEMO_STORES, toBrand } from '../lib/uiData';
import type { Brand, Coupon, Store } from '../lib/types';

interface CouponRows {
  brands: Brand[];
  stores: Store[];
  coupons: Coupon[];
}

interface LoadState {
  rows: CouponRows;
  status: CouponMapLoadStatus;
  message: string | null;
}

export default async function HomePage() {
  const state = await loadCouponRows();
  const view = buildCouponMapView(state.rows, new Date());

  return <CouponMapScreen view={view} status={state.status} message={state.message} />;
}

async function loadCouponRows(): Promise<LoadState> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

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

  const supabase = createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const [brands, stores, coupons] = await Promise.all([
    supabase.from('brands').select('*'),
    supabase.from('stores').select('*'),
    supabase.from('coupons').select('*'),
  ]);

  const error = brands.error ?? stores.error ?? coupons.error;
  if (error) {
    if (shouldUseDemoFallback()) {
      return withDemoRows(`Supabase 오류가 있어 샘플 쿠폰 데이터를 표시합니다. (${error.message})`, 'error');
    }

    return {
      rows: { brands: [], stores: [], coupons: [] },
      status: 'error',
      message: error.message,
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

function shouldUseDemoFallback(): boolean {
  return process.env.NODE_ENV === 'development';
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
