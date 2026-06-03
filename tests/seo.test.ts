import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildHomePageJsonLd,
  getCanonicalUrl,
  getSiteUrl,
  serializeJsonLd,
  SITE_DESCRIPTION,
  SITE_ICON,
  SITE_NAME,
} from '../lib/seo';
import type { CouponMapView } from '../lib/frontendData';

afterEach(() => {
  vi.unstubAllEnvs();
});

const VIEW: CouponMapView = {
  stores: [
    {
      id: 'hongdae',
      name: '홍대점',
      address: '서울 마포구',
      brand: {
        id: 'brand-mcdonalds',
        name: '맥도날드',
        app_scheme: 'mcdonaldskr://',
        store_url: 'https://www.mcdonalds.co.kr',
        app_store_url: null,
      },
      brandName: '맥도날드',
      brandInitial: '맥도',
      brandColor: '#d92d20',
      lat: 37.55634567,
      lng: 126.92365432,
      markerX: 35,
      markerY: 45,
      bestCoupon: {
        id: 'bigmac',
        title: '빅맥 20%',
        headline: '20%',
        detail: '할인',
        validLabel: 'D-7',
        discountType: '정률',
        appLink: 'mcdonaldskr://coupon/bigmac',
        facts: [],
        rankScore: 3_000_020,
      },
      coupons: [
        {
          id: 'bigmac',
          title: '빅맥 20%',
          headline: '20%',
          detail: '할인',
          validLabel: 'D-7',
          discountType: '정률',
          appLink: 'mcdonaldskr://coupon/bigmac',
          facts: [],
          rankScore: 3_000_020,
        },
      ],
    },
  ],
  totals: {
    brands: 1,
    stores: 1,
    activeCoupons: 1,
  },
};

describe('SEO helpers', () => {
  it('normalizes a configured production URL to an origin', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'coupon.example.com/path');

    expect(getSiteUrl().toString()).toBe('https://coupon.example.com/');
    expect(getCanonicalUrl('/sitemap.xml')).toBe('https://coupon.example.com/sitemap.xml');
  });

  it('builds home page structured data from visible coupon stores', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://coupon.example.com');

    const jsonLd = buildHomePageJsonLd(VIEW);
    const website = jsonLd[0];
    const webApp = jsonLd[1];
    const itemList = jsonLd[2];

    expect(website).toMatchObject({
      '@type': 'WebSite',
      '@id': 'https://coupon.example.com/#website',
      name: SITE_NAME,
      description: SITE_DESCRIPTION,
      url: 'https://coupon.example.com/',
    });
    expect(webApp).toMatchObject({
      '@type': 'WebApplication',
      '@id': 'https://coupon.example.com/#app',
      name: SITE_NAME,
      description: SITE_DESCRIPTION,
      url: 'https://coupon.example.com/',
      image: 'https://coupon.example.com/og-coupon-map-ad-dark-1080.png',
      isAccessibleForFree: true,
      provider: {
        '@type': 'Organization',
        logo: `https://coupon.example.com${SITE_ICON}`,
      },
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'KRW',
      },
    });

    const itemListElement = itemList.itemListElement as Record<string, unknown>[];
    const storeItem = itemListElement[0].item as Record<string, unknown>;
    const geo = storeItem.geo as Record<string, unknown>;
    const offers = storeItem.makesOffer as Record<string, unknown>[];

    expect(itemList).toMatchObject({
      '@type': 'ItemList',
      '@id': 'https://coupon.example.com/#nearby-coupon-stores',
      url: 'https://coupon.example.com/',
      numberOfItems: 1,
    });
    expect(itemListElement[0]).toMatchObject({
      '@type': 'ListItem',
      position: 1,
      url: 'https://coupon.example.com/#store-hongdae',
    });
    expect(storeItem).toMatchObject({
      '@type': 'LocalBusiness',
      '@id': 'https://coupon.example.com/#store-hongdae',
      name: '맥도날드 홍대점',
      address: '서울 마포구',
      url: 'https://coupon.example.com/#store-hongdae',
    });
    expect(geo).toMatchObject({
      latitude: 37.556346,
      longitude: 126.923654,
    });
    expect(offers[0]).toMatchObject({
      '@type': 'Offer',
      name: '빅맥 20%',
      description: '할인 · D-7',
      category: '정률',
      url: 'https://coupon.example.com/#store-hongdae',
      availability: 'https://schema.org/InStock',
    });
  });

  it('escapes less-than signs when serializing JSON-LD into a script tag', () => {
    expect(serializeJsonLd({ value: '</script>' })).toContain('\\u003c/script>');
  });
});
