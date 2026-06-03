import { filterActiveCoupons, sortByDiscount } from './coupons';
import { diffDateOnlyDays, getKoreaDateOnly, isValidDateOnly } from './dateOnly';
import { DEFAULT_RADIUS_METERS, isValidCoordinate, nearbyStores } from './stores';
import type { Brand, Coupon, Store } from './types';

export type CouponMapLoadStatus = 'ready' | 'missing-env' | 'empty' | 'error';

export interface CouponMapCoupon {
  id: string;
  title: string;
  headline: string;
  detail: string;
  validLabel: string;
  discountType: Coupon['discount_type'];
  appLink: string | null;
  facts: CouponMapCouponFact[];
  rankScore: number;
}

export interface CouponMapCouponFact {
  label: string;
  value: string;
}

export interface CouponMapStore {
  id: string;
  name: string;
  address: string;
  brand: Brand;
  brandName: string;
  brandInitial: string;
  brandColor: string;
  lat: number;
  lng: number;
  markerX: number;
  markerY: number;
  distanceMeters?: number;
  bestCoupon: CouponMapCoupon;
  coupons: CouponMapCoupon[];
}

export interface CouponMapView {
  stores: CouponMapStore[];
  totals: {
    brands: number;
    stores: number;
    activeCoupons: number;
  };
}

export interface CouponMapRows {
  brands: readonly Brand[];
  stores: readonly Store[];
  coupons: readonly Coupon[];
}

export interface BuildCouponMapViewOptions {
  center?: {
    lat: number;
    lng: number;
  };
  radiusMeters?: number;
}

const BRAND_COLORS = [
  '#d92d20',
  '#067647',
  '#175cd3',
  '#b54708',
  '#7f56d9',
  '#c11574',
  '#0e9384',
  '#344054',
];

export function buildCouponMapView(
  rows: CouponMapRows,
  now: Date,
  options: BuildCouponMapViewOptions = {}
): CouponMapView {
  const brandsById = new Map(rows.brands.map((brand) => [brand.id, brand]));
  const brandColorsById = new Map(
    rows.brands.map((brand, index) => [brand.id, BRAND_COLORS[index % BRAND_COLORS.length]])
  );
  const activeCoupons = filterActiveCoupons(rows.coupons, now);
  const couponsByBrand = groupCouponsByBrand(activeCoupons);

  const eligibleStores = rows.stores
    .filter((store) => brandsById.has(store.brand_id))
    .filter((store) => isValidCoordinate(store.lat, store.lng))
    .filter((store) => (couponsByBrand.get(store.brand_id)?.length ?? 0) > 0);

  const scopedStores = options.center
    ? nearbyStores(
        options.center.lat,
        options.center.lng,
        eligibleStores,
        options.radiusMeters ?? DEFAULT_RADIUS_METERS
      )
    : eligibleStores;

  const markerPositions = computeMarkerPositions(scopedStores);

  const stores = scopedStores
    .map((store) => {
      const brand = brandsById.get(store.brand_id);
      const coupons = couponsByBrand.get(store.brand_id) ?? [];
      const couponSummaries = coupons.map((coupon) => summarizeCoupon(coupon, now));
      const marker = markerPositions.get(store.id) ?? { x: 50, y: 50 };
      const distanceMeters = readDistanceMeters(store);

      return {
        id: store.id,
        name: store.name,
        address: store.address ?? '주소 미등록',
        brand: requireBrand(brand, store.brand_id),
        brandName: brand?.name ?? '브랜드 미등록',
        brandInitial: getBrandInitial(brand?.name ?? store.name),
        brandColor: brandColorsById.get(store.brand_id) ?? BRAND_COLORS[0],
        lat: store.lat,
        lng: store.lng,
        markerX: marker.x,
        markerY: marker.y,
        ...(distanceMeters === undefined ? {} : { distanceMeters }),
        bestCoupon: couponSummaries[0],
        coupons: couponSummaries,
      };
    })
    .sort((a, b) => {
      if (a.distanceMeters !== undefined && b.distanceMeters !== undefined) {
        const distanceDelta = a.distanceMeters - b.distanceMeters;
        if (distanceDelta !== 0) return distanceDelta;
      }

      const rankDelta = b.bestCoupon.rankScore - a.bestCoupon.rankScore;
      if (rankDelta !== 0) return rankDelta;
      const brandDelta = a.brandName.localeCompare(b.brandName, 'ko');
      if (brandDelta !== 0) return brandDelta;
      return a.name.localeCompare(b.name, 'ko');
    });

  return {
    stores,
    totals: {
      brands: new Set(stores.map((store) => store.brandName)).size,
      stores: stores.length,
      activeCoupons: options.center ? countVisibleCouponIds(stores) : activeCoupons.length,
    },
  };
}

function countVisibleCouponIds(stores: readonly CouponMapStore[]): number {
  const couponIds = new Set<string>();

  for (const store of stores) {
    for (const coupon of store.coupons) {
      couponIds.add(coupon.id);
    }
  }

  return couponIds.size;
}

function readDistanceMeters(store: Store): number | undefined {
  const distanceMeters = (store as Partial<{ distanceMeters: unknown }>).distanceMeters;
  return typeof distanceMeters === 'number' && Number.isFinite(distanceMeters)
    ? distanceMeters
    : undefined;
}

function groupCouponsByBrand(coupons: readonly Coupon[]): Map<string, Coupon[]> {
  const grouped = new Map<string, Coupon[]>();
  for (const coupon of coupons) {
    const list = grouped.get(coupon.brand_id) ?? [];
    list.push(coupon);
    grouped.set(coupon.brand_id, list);
  }

  for (const [brandId, list] of grouped) {
    grouped.set(brandId, sortByDiscount(list));
  }

  return grouped;
}

function summarizeCoupon(coupon: Coupon, now: Date): CouponMapCoupon {
  const rawPayload = readCouponRawPayload(coupon.raw_payload);

  return {
    id: coupon.id,
    title: coupon.title,
    headline: readStringField(rawPayload, 'headline') ?? formatDiscountHeadline(coupon),
    detail: readStringField(rawPayload, 'detail_text') ?? formatDiscountDetail(coupon),
    validLabel: formatValidityLabel(coupon.valid_until, now),
    discountType: coupon.discount_type,
    appLink: readStringField(rawPayload, 'app_link'),
    facts: formatCouponFacts(rawPayload),
    rankScore: rankCoupon(coupon),
  };
}

function requireBrand(brand: Brand | undefined, brandId: string): Brand {
  if (brand) return brand;
  throw new Error(`Missing brand for store brand_id=${brandId}`);
}

function computeMarkerPositions(stores: readonly Store[]): Map<string, { x: number; y: number }> {
  const result = new Map<string, { x: number; y: number }>();
  if (stores.length === 0) return result;

  const minLat = Math.min(...stores.map((store) => store.lat));
  const maxLat = Math.max(...stores.map((store) => store.lat));
  const minLng = Math.min(...stores.map((store) => store.lng));
  const maxLng = Math.max(...stores.map((store) => store.lng));
  const latSpan = maxLat - minLat;
  const lngSpan = maxLng - minLng;

  stores.forEach((store, index) => {
    const baseX = lngSpan === 0 ? 50 : 10 + ((store.lng - minLng) / lngSpan) * 80;
    const baseY = latSpan === 0 ? 50 : 10 + ((maxLat - store.lat) / latSpan) * 80;
    const offset = stores.length === 1 ? 0 : ((index % 3) - 1) * 1.8;

    result.set(store.id, {
      x: clamp(baseX + offset, 8, 92),
      y: clamp(baseY - offset, 8, 92),
    });
  });

  return result;
}

function formatDiscountHeadline(coupon: Coupon): string {
  if (coupon.discount_type === '정률') return `${formatNumber(coupon.discount_value)}%`;
  if (coupon.discount_type === '정액') return `${formatNumber(coupon.discount_value)}원`;
  return `${formatNumber(coupon.discount_value)}원`;
}

function formatDiscountDetail(coupon: Coupon): string {
  if (coupon.discount_type === '정률') return '할인';
  if (coupon.discount_type === '정액') return '즉시 할인';
  return '세트가';
}

function formatValidityLabel(validUntil: string | null, now: Date): string {
  if (validUntil === null) return '상시';
  if (!isValidDateOnly(validUntil)) return '기간 확인';

  const dayDelta = diffDateOnlyDays(getKoreaDateOnly(now), validUntil);
  if (dayDelta === null) return '기간 확인';
  if (dayDelta === 0) return '오늘까지';
  return `D-${dayDelta}`;
}

function formatCouponFacts(rawPayload: CouponRawPayload): CouponMapCouponFact[] {
  const facts: CouponMapCouponFact[] = [];

  const paymentAmount = readNumberField(rawPayload, 'payment_amount_krw') ??
    readNumberField(rawPayload, 'coupon_price_krw');
  const discountAmount = readNumberField(rawPayload, 'discount_amount_krw');
  const productPrice = readNumberField(rawPayload, 'product_price_krw') ??
    readNumberField(rawPayload, 'original_price_krw');
  const orderMethods = readStringArrayField(rawPayload, 'order_methods');
  const validPeriodText = readStringField(rawPayload, 'valid_period_text') ??
    formatRawValidityPeriod(
      readStringField(rawPayload, 'valid_from'),
      readStringField(rawPayload, 'valid_until')
    );

  if (paymentAmount !== null) facts.push({ label: '결제금액', value: formatWon(paymentAmount) });
  if (discountAmount !== null) facts.push({ label: '할인금액', value: formatWon(discountAmount) });
  if (productPrice !== null) facts.push({ label: '상품금액', value: formatWon(productPrice) });
  if (orderMethods.length > 0) facts.push({ label: '주문', value: orderMethods.join(', ') });
  if (readBooleanField(rawPayload, 'is_weekly_coupon') === true) {
    facts.push({ label: '구분', value: '위클리 쿠폰' });
  }
  if (validPeriodText !== null) facts.push({ label: '유효기간', value: validPeriodText });

  return facts.slice(0, 6);
}

type CouponRawPayload = {
  topLevel: Record<string, unknown>;
  detail: Record<string, unknown>;
};

function readCouponRawPayload(value: unknown): CouponRawPayload {
  if (!isRecord(value)) return { topLevel: {}, detail: {} };
  const detail = isRecord(value.detail) ? value.detail : {};
  return { topLevel: value, detail };
}

function readStringField(payload: CouponRawPayload, field: string): string | null {
  const value = readField(payload, field);
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function readNumberField(payload: CouponRawPayload, field: string): number | null {
  const value = readField(payload, field);
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readBooleanField(payload: CouponRawPayload, field: string): boolean | null {
  const value = readField(payload, field);
  return typeof value === 'boolean' ? value : null;
}

function readStringArrayField(payload: CouponRawPayload, field: string): string[] {
  const value = readField(payload, field);
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim());
}

function readField(payload: CouponRawPayload, field: string): unknown {
  return payload.topLevel[field] ?? payload.detail[field];
}

function formatRawValidityPeriod(validFrom: string | null, validUntil: string | null): string | null {
  if (validFrom !== null && validUntil !== null) return `${validFrom} - ${validUntil}`;
  return validUntil;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function rankCoupon(coupon: Coupon): number {
  if (coupon.discount_type === '정률') return 3_000_000 + coupon.discount_value;
  if (coupon.discount_type === '정액') return 2_000_000 + coupon.discount_value;
  return 1_000_000 - coupon.discount_value;
}

function getBrandInitial(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '?';
  const asciiWords = trimmed.match(/[A-Za-z0-9]+/g);
  const firstAsciiWord = asciiWords?.[0];
  if (firstAsciiWord) {
    const upper = firstAsciiWord.toUpperCase();
    return upper.length <= 3 ? upper : upper.slice(0, 2);
  }
  return Array.from(trimmed).slice(0, 2).join('');
}

function formatNumber(value: number): string {
  return value.toLocaleString('ko-KR', {
    maximumFractionDigits: Number.isInteger(value) ? 0 : 1,
  });
}

function formatWon(value: number): string {
  return `${formatNumber(value)}원`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
