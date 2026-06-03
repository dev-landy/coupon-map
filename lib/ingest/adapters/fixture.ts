import type { CrawlAdapter } from '../types.ts';

export const fixtureAdapter: CrawlAdapter = {
  source: 'fixture',
  async crawl() {
    return {
      brand: {
        source: 'fixture',
        external_id: 'fixture-brand',
        name: 'Fixture Brand',
        app_scheme: null,
        store_url: 'https://example.com',
        app_store_url: null,
      },
      stores: [
        {
          external_id: 'fixture-store-hongdae',
          name: 'Fixture Hongdae',
          lat: 37.5563,
          lng: 126.9236,
          address: 'Seoul Mapo-gu',
        },
      ],
      coupons: [
        {
          external_id: 'fixture-coupon-001',
          title: 'Fixture Coupon',
          discount_type: '정액',
          discount_value: 1000,
          valid_until: null,
          raw_payload: { fixture: true },
        },
      ],
    };
  },
};
