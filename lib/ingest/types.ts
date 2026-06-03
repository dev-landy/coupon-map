import type { DiscountType } from '../types.ts';

export interface CrawlBrandInput {
  source: string;
  external_id: string;
  name: string;
  app_scheme: string | null;
  store_url: string;
  app_store_url: string | null;
}

export interface CrawlStoreInput {
  external_id: string;
  name: string;
  lat: number;
  lng: number;
  address: string | null;
}

export interface CrawlCouponInput {
  external_id?: string | null;
  title: string;
  discount_type: DiscountType;
  discount_value: number;
  valid_until: string | null;
  is_active?: boolean;
  raw_payload?: unknown;
}

export interface CrawlPayload {
  brand: CrawlBrandInput;
  stores: CrawlStoreInput[];
  coupons: CrawlCouponInput[];
  fetched_at?: string;
}

export interface NormalizedCrawlCoupon extends CrawlCouponInput {
  external_id: string | null;
  content_hash: string;
  is_active: boolean;
}

export interface CrawlAdapter {
  source: string;
  crawl(): Promise<CrawlPayload>;
}

export interface NormalizedCrawlPayload extends CrawlPayload {
  fetched_at: string;
  brand: CrawlBrandInput;
  stores: CrawlStoreInput[];
  coupons: NormalizedCrawlCoupon[];
}

export interface IngestResult {
  source: string;
  brandId: string;
  storesUpserted: number;
  couponsUpserted: number;
  couponsDeactivated?: number;
}
