import type { CouponMapView } from './frontendData';

export const SITE_NAME = '쿠폰맵';
export const SITE_TITLE = '쿠폰맵 - 내 주변 프랜차이즈 할인 쿠폰 지도';
export const SITE_DESCRIPTION =
  '내 주변 맥도날드, 버거킹, KFC 매장의 할인 쿠폰과 유효기간을 지도에서 비교하고 바로 앱으로 열어보세요.';
export const SITE_LANGUAGE = 'ko-KR';
export const SITE_LOCALE = 'ko_KR';
export const SITE_OG_IMAGE = '/og-coupon-map-ad-dark-1080.png';
export const SITE_OG_IMAGE_WIDTH = 1080;
export const SITE_OG_IMAGE_HEIGHT = 1080;
export const SITE_ICON = '/icon.svg';
export const SITE_IMAGE_ALT = '쿠폰맵 주변 프랜차이즈 쿠폰 찾기 광고 이미지';

type JsonLdObject = Record<string, unknown>;

const PRODUCTION_SITE_URL = 'https://www.쿠폰맵.com';
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
  const siteUrl = getCanonicalUrl('/');

  return [
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      '@id': getCanonicalFragmentUrl('website'),
      name: SITE_NAME,
      url: siteUrl,
      inLanguage: SITE_LANGUAGE,
      description: SITE_DESCRIPTION,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      '@id': getCanonicalFragmentUrl('app'),
      name: SITE_NAME,
      url: siteUrl,
      applicationCategory: 'FoodAndDrinkApplication',
      operatingSystem: 'Web',
      inLanguage: SITE_LANGUAGE,
      description: SITE_DESCRIPTION,
      isAccessibleForFree: true,
      image: getCanonicalUrl(SITE_OG_IMAGE),
      provider: {
        '@type': 'Organization',
        name: SITE_NAME,
        url: siteUrl,
        logo: getCanonicalUrl(SITE_ICON),
      },
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'KRW',
      },
      areaServed: {
        '@type': 'Country',
        name: '대한민국',
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      '@id': getCanonicalFragmentUrl('nearby-coupon-stores'),
      name: '근처 프랜차이즈 쿠폰 매장',
      description: '현재 지도 반경 안에서 사용할 수 있는 프랜차이즈 쿠폰 매장 목록입니다.',
      url: siteUrl,
      numberOfItems: view.stores.length,
      itemListElement: view.stores
        .slice(0, MAX_STRUCTURED_DATA_STORES)
        .map((store, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          url: getStoreFragmentUrl(store),
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
  const storeUrl = getStoreFragmentUrl(store);
  const storeJsonLd: JsonLdObject = {
    '@type': 'LocalBusiness',
    '@id': storeUrl,
    name: `${store.brandName} ${store.name}`,
    url: storeUrl,
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
        url: storeUrl,
        availability: 'https://schema.org/InStock',
        areaServed: {
          '@type': 'Country',
          name: '대한민국',
        },
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

function getCanonicalFragmentUrl(fragment: string): string {
  const url = new URL('/', getSiteUrl());
  url.hash = fragment;
  return url.toString();
}

function getStoreFragmentUrl(store: CouponMapView['stores'][number]): string {
  return getCanonicalFragmentUrl(`store-${store.id}`);
}
