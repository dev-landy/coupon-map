import { createHash } from 'node:crypto';

import type { NormalizedCrawlPayload } from './types.ts';

export interface BrandUpsertRow {
  source: string;
  external_id: string;
  name: string;
  app_scheme: string | null;
  store_url: string;
  app_store_url: string | null;
  iphone_store_url: string | null;
  updated_at: string;
  last_seen_at: string;
}

export interface StoreUpsertRow {
  brand_id: string;
  source: string;
  external_id: string;
  name: string;
  lat: number;
  lng: number;
  address: string | null;
  updated_at: string;
  last_seen_at: string;
}

export interface CouponUpsertRow {
  brand_id: string;
  source: string;
  external_id: string | null;
  content_hash: string;
  title: string;
  discount_type: string;
  discount_value: number;
  valid_until: string | null;
  is_active: boolean;
  raw_payload: unknown;
  updated_at: string;
  last_seen_at: string;
}

export function buildBrandUpsertRow(payload: NormalizedCrawlPayload): BrandUpsertRow {
  return {
    source: payload.brand.source,
    external_id: payload.brand.external_id,
    name: payload.brand.name,
    app_scheme: payload.brand.app_scheme,
    store_url: payload.brand.store_url,
    app_store_url: payload.brand.app_store_url,
    iphone_store_url: payload.brand.iphone_store_url ?? null,
    updated_at: payload.fetched_at,
    last_seen_at: payload.fetched_at,
  };
}

export function buildStoreUpsertRows(
  payload: NormalizedCrawlPayload,
  brandId: string
): StoreUpsertRow[] {
  return payload.stores.map((store) => ({
    brand_id: brandId,
    source: payload.brand.source,
    external_id: store.external_id,
    name: store.name,
    lat: store.lat,
    lng: store.lng,
    address: store.address,
    updated_at: payload.fetched_at,
    last_seen_at: payload.fetched_at,
  }));
}

export function buildCouponUpsertRows(
  payload: NormalizedCrawlPayload,
  brandId: string
): CouponUpsertRow[] {
  return payload.coupons.map((coupon) => ({
    brand_id: brandId,
    source: payload.brand.source,
    external_id: coupon.external_id,
    content_hash: buildCouponStorageContentHash(coupon),
    title: coupon.title,
    discount_type: coupon.discount_type,
    discount_value: coupon.discount_value,
    valid_until: coupon.valid_until,
    is_active: coupon.is_active,
    raw_payload: coupon.raw_payload ?? null,
    updated_at: payload.fetched_at,
    last_seen_at: payload.fetched_at,
  }));
}

function buildCouponStorageContentHash(
  coupon: NormalizedCrawlPayload['coupons'][number]
): string {
  if (coupon.external_id === null) return coupon.content_hash;

  return createHash('sha256')
    .update(
      JSON.stringify({
        external_id: coupon.external_id,
        content_hash: coupon.content_hash,
      }),
      'utf8'
    )
    .digest('hex');
}
