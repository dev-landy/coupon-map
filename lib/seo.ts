import type { CouponMapView } from './frontendData';

export const SITE_NAME = '쿠폰맵';
export const SITE_TITLE = '쿠폰맵 - 내 주변 프랜차이즈 쿠폰 지도';
export const SITE_DESCRIPTION =
  '내 위치 근처 맥도날드, 버거킹, KFC 등 프랜차이즈 매장의 할인 쿠폰과 유효기간을 지도에서 확인하세요.';
export const SITE_KEYWORDS = [
  '쿠폰맵',
  '프랜차이즈 쿠폰',
  '할인 쿠폰',
  '주변 쿠폰',
  '맥도날드 쿠폰',
  '버거킹 쿠폰',
  'KFC 쿠폰',
  '쿠폰 지도',
];

type JsonLdObject = Record<string, unknown>;

const PRODUCTION_SITE_URL = 'https://쿠폰맵.com';
const MAX_STRUCTURED_DATA_STORES = 20;
const MAX_STRUCTURED_DATA_COUPONS_PER_STORE = 3;

export function getSiteUrl(): URL {
  const candidates = [
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.SITE_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    process.env.VERCEL_URL,
    PRODUCTION_SITE_URL,
  ];

  for (const candidate of candidates) {
    const siteUrl = normalizeSiteUrl(candidate);
    if (siteUrl) return siteUrl;
  }

  return new URL(PRODUCTION_SITE_URL);
}

export function getCanonicalUrl(pathname = '/'): string {
  return new URL(pathname, getSiteUrl()).toString();
}

export function buildHomePageJsonLd(view: CouponMapView): JsonLdObject[] {
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: SITE_NAME,
      url: getCanonicalUrl('/'),
      applicationCategory: 'FoodAndDrinkApplication',
      operatingSystem: 'Web',
      inLanguage: 'ko-KR',
      description: SITE_DESCRIPTION,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: '근처 프랜차이즈 쿠폰 매장',
      numberOfItems: view.stores.length,
      itemListElement: view.stores
        .slice(0, MAX_STRUCTURED_DATA_STORES)
        .map((store, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          item: buildStoreJsonLd(store),
        })),
    },
  ];
}

export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function normalizeSiteUrl(value: string | undefined): URL | null {
  if (!value) return null;

  try {
    const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    const url = new URL(withProtocol);
    return new URL(url.origin);
  } catch {
    return null;
  }
}

function buildStoreJsonLd(store: CouponMapView['stores'][number]): JsonLdObject {
  const storeJsonLd: JsonLdObject = {
    '@type': 'LocalBusiness',
    name: `${store.brandName} ${store.name}`,
    url: getCanonicalUrl('/'),
    geo: {
      '@type': 'GeoCoordinates',
      latitude: roundCoordinate(store.lat),
      longitude: roundCoordinate(store.lng),
    },
    brand: buildBrandJsonLd(store),
    makesOffer: store.coupons
      .slice(0, MAX_STRUCTURED_DATA_COUPONS_PER_STORE)
      .map((coupon) => ({
        '@type': 'Offer',
        name: coupon.title,
        description: `${coupon.detail} · ${coupon.validLabel}`,
        category: coupon.discountType,
        url: getCanonicalUrl('/'),
      })),
  };

  if (store.address && store.address !== '주소 미등록') {
    storeJsonLd.address = store.address;
  }

  return storeJsonLd;
}

function buildBrandJsonLd(store: CouponMapView['stores'][number]): JsonLdObject {
  const brand: JsonLdObject = {
    '@type': 'Brand',
    name: store.brandName,
  };

  if (isHttpUrl(store.brand.store_url)) {
    brand.sameAs = store.brand.store_url;
  }

  return brand;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function roundCoordinate(value: number): number {
  return Number(value.toFixed(6));
}
