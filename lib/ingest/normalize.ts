import { createHash } from 'node:crypto';
import type {
  CrawlBrandInput,
  CrawlCouponInput,
  CrawlPayload,
  CrawlStoreInput,
  NormalizedCrawlCoupon,
  NormalizedCrawlPayload,
} from './types.ts';
import type { DiscountType } from '../types.ts';
import { isValidCoordinate } from '../stores.ts';

const DISCOUNT_TYPES: readonly DiscountType[] = ['정액', '정률', '세트'];

export function normalizeCrawlPayload(
  payload: CrawlPayload,
  now: Date = new Date()
): NormalizedCrawlPayload {
  const fetchedAt = normalizeTimestamp(payload.fetched_at, now);
  const brand = normalizeBrand(payload.brand);
  const stores = payload.stores.map(normalizeStore);
  const coupons = payload.coupons.map(normalizeCoupon);

  assertUniqueExternalIds('store', stores);
  assertUniqueCouponIdentities(coupons);

  return {
    brand,
    stores,
    coupons,
    fetched_at: fetchedAt,
  };
}

function normalizeBrand(brand: CrawlBrandInput): CrawlBrandInput {
  const normalized = {
    source: requiredText(brand.source, 'brand.source'),
    external_id: requiredText(brand.external_id, 'brand.external_id'),
    name: requiredText(brand.name, 'brand.name'),
    app_scheme: optionalText(brand.app_scheme),
    store_url: requiredText(brand.store_url, 'brand.store_url'),
    app_store_url: optionalText(brand.app_store_url),
  };

  if (!isHttpUrl(normalized.store_url)) {
    throw new Error(`brand.store_url must be an http(s) URL: ${normalized.store_url}`);
  }
  if (normalized.app_store_url !== null && !isHttpUrl(normalized.app_store_url)) {
    throw new Error(
      `brand.app_store_url must be an http(s) URL: ${normalized.app_store_url}`
    );
  }

  return normalized;
}

function normalizeStore(store: CrawlStoreInput): CrawlStoreInput {
  const normalized = {
    external_id: requiredText(store.external_id, 'store.external_id'),
    name: requiredText(store.name, 'store.name'),
    lat: store.lat,
    lng: store.lng,
    address: optionalText(store.address),
  };

  if (!isValidCoordinate(normalized.lat, normalized.lng)) {
    throw new Error(
      `Invalid store coordinates for ${normalized.external_id}: ` +
        `lat=${normalized.lat}, lng=${normalized.lng}`
    );
  }

  return normalized;
}

function normalizeCoupon(coupon: CrawlCouponInput): NormalizedCrawlCoupon {
  const normalized = {
    external_id: optionalText(coupon.external_id),
    title: requiredText(coupon.title, 'coupon.title'),
    discount_type: coupon.discount_type,
    discount_value: coupon.discount_value,
    valid_until: optionalText(coupon.valid_until),
    is_active: coupon.is_active ?? true,
    raw_payload: coupon.raw_payload,
  };

  if (!DISCOUNT_TYPES.includes(normalized.discount_type)) {
    throw new Error(`Invalid coupon.discount_type: ${String(normalized.discount_type)}`);
  }
  if (!Number.isFinite(normalized.discount_value) || normalized.discount_value < 0) {
    throw new Error(
      `Invalid coupon.discount_value for ${couponDebugId(normalized)}: ` +
        `${normalized.discount_value}`
    );
  }
  if (
    normalized.valid_until !== null &&
    !/^\d{4}-\d{2}-\d{2}$/.test(normalized.valid_until)
  ) {
    throw new Error(
      `coupon.valid_until must be YYYY-MM-DD or null for ${couponDebugId(normalized)}`
    );
  }

  return {
    ...normalized,
    content_hash: createCouponContentHash(normalized),
  };
}

function createCouponContentHash(
  coupon: Pick<CrawlCouponInput, 'title' | 'discount_type' | 'discount_value' | 'valid_until'>
): string {
  const identity = {
    title: coupon.title,
    discount_type: coupon.discount_type,
    discount_value: coupon.discount_value,
    valid_until: coupon.valid_until,
  };

  return createHash('sha256')
    .update(JSON.stringify(identity), 'utf8')
    .digest('hex');
}

function requiredText(value: string, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${field} is required`);
  }
  return value.trim();
}

function optionalText(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeTimestamp(value: string | undefined, now: Date): string {
  if (value === undefined || value.trim().length === 0) return now.toISOString();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`fetched_at must be an ISO timestamp: ${value}`);
  }
  return parsed.toISOString();
}

function assertUniqueExternalIds(
  label: 'store' | 'coupon',
  rows: readonly { external_id: string | null }[]
): void {
  const seen = new Set<string>();
  for (const row of rows) {
    if (row.external_id === null) continue;
    if (seen.has(row.external_id)) {
      throw new Error(`Duplicate ${label}.external_id in crawl payload: ${row.external_id}`);
    }
    seen.add(row.external_id);
  }
}

function assertUniqueCouponIdentities(coupons: readonly NormalizedCrawlCoupon[]): void {
  const seen = new Set<string>();

  for (const coupon of coupons) {
    const identity =
      coupon.external_id !== null
        ? {
            key: `external_id:${coupon.external_id}`,
            label: 'external_id',
            value: coupon.external_id,
          }
        : {
            key: `content_hash:${coupon.content_hash}`,
            label: 'content_hash',
            value: coupon.content_hash,
          };

    if (seen.has(identity.key)) {
      throw new Error(
        `Duplicate coupon.${identity.label} in crawl payload: ${identity.value}`
      );
    }
    seen.add(identity.key);
  }
}

function couponDebugId(coupon: Pick<NormalizedCrawlCoupon, 'external_id' | 'title'>): string {
  return coupon.external_id ?? coupon.title;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}
