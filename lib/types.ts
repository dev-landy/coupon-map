/**
 * Domain types mirroring supabase/schema.sql.
 *
 * Field names use snake_case to match the database columns directly,
 * so rows returned by supabase-js map onto these types without renaming.
 */

export type DiscountType = '정액' | '정률' | '세트';

export interface Brand {
  id: string;
  /** Data owner, e.g. manual, mcdonalds-kr. */
  source?: string;
  /** Stable source-side identifier used by crawler upserts. */
  external_id?: string | null;
  name: string;
  /** App deep-link scheme, e.g. 'mybrandapp://'. May be null for web-only brands. */
  app_scheme: string | null;
  /** Web URL used as the desktop / no-scheme fallback. */
  store_url: string;
  /** Legacy mobile store URL; Play Store for Android fallback. */
  app_store_url: string | null;
  /** iPhone App Store URL used as the iOS fallback. */
  iphone_store_url?: string | null;
  updated_at?: string;
  last_seen_at?: string | null;
  created_at?: string;
}

export interface Store {
  id: string;
  brand_id: string;
  source?: string;
  external_id?: string | null;
  name: string;
  lat: number;
  lng: number;
  address: string | null;
  updated_at?: string;
  last_seen_at?: string | null;
  created_at?: string;
}

export interface Coupon {
  id: string;
  brand_id: string;
  source?: string;
  external_id?: string | null;
  content_hash?: string | null;
  title: string;
  discount_type: DiscountType;
  /** For 정액: KRW amount off. For 정률: percent (0-100). For 세트: set price in KRW. */
  discount_value: number;
  /** ISO date string (YYYY-MM-DD), or null for no expiry. */
  valid_until: string | null;
  is_active: boolean;
  raw_payload?: unknown;
  updated_at?: string;
  last_seen_at?: string | null;
  created_at?: string;
}
