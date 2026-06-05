import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { normalizeCrawlPayload } from '../lib/ingest/normalize';
import {
  buildBrandUpsertRow,
  buildCouponUpsertRows,
  buildStoreUpsertRows,
} from '../lib/ingest/rows';
import type { CrawlPayload } from '../lib/ingest/types';

const NOW = new Date('2026-06-02T03:00:00.000Z');

function expectedCouponContentHash(coupon: {
  title: string;
  discount_type: CrawlPayload['coupons'][number]['discount_type'];
  discount_value: number;
  valid_until: string | null;
}): string {
  return createHash('sha256')
    .update(JSON.stringify(coupon), 'utf8')
    .digest('hex');
}

function expectedStoredCouponContentHash(coupon: {
  external_id: string | null;
  content_hash: string;
}): string {
  if (coupon.external_id === null) return coupon.content_hash;

  return createHash('sha256')
    .update(JSON.stringify(coupon), 'utf8')
    .digest('hex');
}

function makePayload(overrides: Partial<CrawlPayload> = {}): CrawlPayload {
  return {
    brand: {
      source: 'mcdonalds-kr',
      external_id: 'mcdonalds',
      name: '맥도날드',
      app_scheme: 'https://links.mcdonaldsapps.com/',
      store_url: 'https://www.mcdonalds.co.kr',
      app_store_url: 'https://play.google.com/store/apps/details?id=kr.co.mcdonalds',
      iphone_store_url: 'https://apps.apple.com/kr/app/id1217507712',
    },
    stores: [
      {
        external_id: 'hongdae',
        name: '홍익대점',
        lat: 37.5563,
        lng: 126.9236,
        address: '서울 마포구',
      },
    ],
    coupons: [
      {
        external_id: 'bigmac-30',
        title: '빅맥 세트 30%',
        discount_type: '정률',
        discount_value: 30,
        valid_until: '2026-06-30',
        raw_payload: { id: 'bigmac-30' },
      },
    ],
    ...overrides,
  };
}

describe('normalizeCrawlPayload', () => {
  it('normalizes optional fields and defaults coupons to active', () => {
    // Arrange
    const payload = makePayload({
      brand: {
        source: ' mcdonalds-kr ',
        external_id: ' mcdonalds ',
        name: ' 맥도날드 ',
        app_scheme: ' ',
        store_url: 'https://www.mcdonalds.co.kr ',
        app_store_url: null,
        iphone_store_url: ' https://apps.apple.com/kr/app/id1217507712 ',
      },
      coupons: [
        {
          external_id: ' c1 ',
          title: ' 쿠폰 ',
          discount_type: '정액',
          discount_value: 1000,
          valid_until: null,
        },
      ],
    });

    // Act
    const normalized = normalizeCrawlPayload(payload, NOW);

    // Assert
    expect(normalized.fetched_at).toBe('2026-06-02T03:00:00.000Z');
    expect(normalized.brand.source).toBe('mcdonalds-kr');
    expect(normalized.brand.external_id).toBe('mcdonalds');
    expect(normalized.brand.app_scheme).toBeNull();
    expect(normalized.brand.iphone_store_url).toBe(
      'https://apps.apple.com/kr/app/id1217507712'
    );
    expect(normalized.coupons[0]).toMatchObject({
      external_id: 'c1',
      title: '쿠폰',
      content_hash: expectedCouponContentHash({
        title: '쿠폰',
        discount_type: '정액',
        discount_value: 1000,
        valid_until: null,
      }),
      is_active: true,
      valid_until: null,
    });
  });

  it('generates stable content hashes from coupon identity fields', () => {
    // Arrange
    const baseCoupon = {
      external_id: 'bigmac-30',
      title: '빅맥 세트 30%',
      discount_type: '정률' as const,
      discount_value: 30,
      valid_until: '2026-06-30',
    };

    // Act
    const normalized = normalizeCrawlPayload(makePayload({ coupons: [baseCoupon] }), NOW);
    const sameContent = normalizeCrawlPayload(
      makePayload({
        coupons: [
          {
            ...baseCoupon,
            external_id: 'renamed-source-id',
            title: ' 빅맥 세트 30% ',
          },
        ],
      }),
      NOW
    );
    const changedContent = normalizeCrawlPayload(
      makePayload({
        coupons: [
          {
            ...baseCoupon,
            valid_until: '2026-07-01',
          },
        ],
      }),
      NOW
    );

    // Assert
    expect(normalized.coupons[0].content_hash).toBe(
      expectedCouponContentHash({
        title: '빅맥 세트 30%',
        discount_type: '정률',
        discount_value: 30,
        valid_until: '2026-06-30',
      })
    );
    expect(sameContent.coupons[0].content_hash).toBe(
      normalized.coupons[0].content_hash
    );
    expect(changedContent.coupons[0].content_hash).not.toBe(
      normalized.coupons[0].content_hash
    );
  });

  it('uses content_hash as the identity fallback when coupon external_id is absent', () => {
    // Arrange
    const payload = makePayload({
      coupons: [
        {
          title: '외부 ID 없는 쿠폰',
          discount_type: '정액',
          discount_value: 1500,
          valid_until: null,
        },
      ],
    });

    // Act
    const normalized = normalizeCrawlPayload(payload, NOW);

    // Assert
    expect(normalized.coupons[0].external_id).toBeNull();
    expect(normalized.coupons[0].content_hash).toBe(
      expectedCouponContentHash({
        title: '외부 ID 없는 쿠폰',
        discount_type: '정액',
        discount_value: 1500,
        valid_until: null,
      })
    );
  });

  it('rejects duplicate source-side coupon ids', () => {
    // Arrange
    const payload = makePayload({
      coupons: [
        {
          external_id: 'dup',
          title: 'A',
          discount_type: '정률',
          discount_value: 10,
          valid_until: null,
        },
        {
          external_id: 'dup',
          title: 'B',
          discount_type: '정액',
          discount_value: 1000,
          valid_until: null,
        },
      ],
    });

    // Act / Assert
    expect(() => normalizeCrawlPayload(payload, NOW)).toThrow(/Duplicate coupon/);
  });

  it('rejects invalid store coordinates', () => {
    // Arrange
    const payload = makePayload({
      stores: [
        {
          external_id: 'bad',
          name: '좌표 오류',
          lat: 999,
          lng: 126.9236,
          address: null,
        },
      ],
    });

    // Act / Assert
    expect(() => normalizeCrawlPayload(payload, NOW)).toThrow(/Invalid store coordinates/);
  });
});

describe('ingest row builders', () => {
  it('builds brand, store, and coupon upsert rows from normalized payload', () => {
    // Arrange
    const normalized = normalizeCrawlPayload(makePayload(), NOW);

    // Act
    const brandRow = buildBrandUpsertRow(normalized);
    const storeRows = buildStoreUpsertRows(normalized, 'brand-uuid');
    const couponRows = buildCouponUpsertRows(normalized, 'brand-uuid');

    // Assert
    expect(brandRow).toMatchObject({
      source: 'mcdonalds-kr',
      external_id: 'mcdonalds',
      name: '맥도날드',
      iphone_store_url: 'https://apps.apple.com/kr/app/id1217507712',
      last_seen_at: '2026-06-02T03:00:00.000Z',
    });
    expect(storeRows).toEqual([
      expect.objectContaining({
        brand_id: 'brand-uuid',
        source: 'mcdonalds-kr',
        external_id: 'hongdae',
      }),
    ]);
    expect(couponRows).toEqual([
      expect.objectContaining({
        brand_id: 'brand-uuid',
        source: 'mcdonalds-kr',
        external_id: 'bigmac-30',
        content_hash: expectedStoredCouponContentHash({
          external_id: 'bigmac-30',
          content_hash: normalized.coupons[0].content_hash,
        }),
        is_active: true,
        raw_payload: { id: 'bigmac-30' },
      }),
    ]);
  });

  it('stores distinct content hashes for same-content coupons with different external ids', () => {
    // Arrange
    const normalized = normalizeCrawlPayload(
      makePayload({
        coupons: [
          {
            external_id: 'store-order-coupon',
            title: '징거버거 세트',
            discount_type: '정액',
            discount_value: 1000,
            valid_until: '2026-06-30',
          },
          {
            external_id: 'delivery-coupon',
            title: '징거버거 세트',
            discount_type: '정액',
            discount_value: 1000,
            valid_until: '2026-06-30',
          },
        ],
      }),
      NOW
    );

    // Act
    const couponRows = buildCouponUpsertRows(normalized, 'brand-uuid');

    // Assert
    expect(normalized.coupons[0].content_hash).toBe(normalized.coupons[1].content_hash);
    expect(couponRows[0].content_hash).not.toBe(couponRows[1].content_hash);
  });
});
