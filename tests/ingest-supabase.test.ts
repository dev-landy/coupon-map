import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { ingestCrawlPayload } from '../lib/ingest/supabase';
import type { CrawlPayload } from '../lib/ingest/types';

const NOW = new Date('2026-06-02T03:00:00.000Z');

interface QueryCall {
  table: string;
  method: string;
  args: unknown[];
}

function makePayload(overrides: Partial<CrawlPayload> = {}): CrawlPayload {
  return {
    brand: {
      source: 'mcdonalds-kr',
      external_id: 'mcdonalds',
      name: '맥도날드',
      app_scheme: 'https://links.mcdonaldsapps.com/',
      store_url: 'https://www.mcdonalds.co.kr',
      app_store_url: null,
    },
    stores: [],
    coupons: [
      {
        external_id: 'coupon-a',
        title: '첫 번째 쿠폰',
        discount_type: '정률',
        discount_value: 10,
        valid_until: '2026-06-30',
      },
      {
        external_id: 'coupon-b',
        title: '두 번째 쿠폰',
        discount_type: '정액',
        discount_value: 1000,
        valid_until: null,
      },
    ],
    ...overrides,
  };
}

function createMockClient(deactivatedCount = 0): {
  client: SupabaseClient;
  calls: QueryCall[];
} {
  const calls: QueryCall[] = [];

  const client = {
    from: vi.fn((table: string) => {
      if (table === 'brands') {
        return {
          upsert: vi.fn((...args: unknown[]) => {
            calls.push({ table, method: 'upsert', args });
            return {
              select: vi.fn((...selectArgs: unknown[]) => {
                calls.push({ table, method: 'select', args: selectArgs });
                return {
                  single: vi.fn(async (...singleArgs: unknown[]) => {
                    calls.push({ table, method: 'single', args: singleArgs });
                    return { data: { id: 'brand-id' }, error: null };
                  }),
                };
              }),
            };
          }),
        };
      }

      if (table === 'coupons') {
        return {
          upsert: vi.fn(async (...args: unknown[]) => {
            calls.push({ table, method: 'upsert', args });
            return { data: null, error: null };
          }),
          update: vi.fn((...args: unknown[]) => {
            calls.push({ table, method: 'update', args });
            const updateChain = {
              eq: vi.fn((...eqArgs: unknown[]) => {
                calls.push({ table, method: 'eq', args: eqArgs });
                return updateChain;
              }),
              not: vi.fn(async (...notArgs: unknown[]) => {
                calls.push({ table, method: 'not', args: notArgs });
                return { data: null, error: null, count: deactivatedCount };
              }),
            };
            return updateChain;
          }),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    }),
  };

  return { client: client as unknown as SupabaseClient, calls };
}

describe('ingestCrawlPayload Supabase sync', () => {
  it('deactivates active coupons missing from the brand/source snapshot after upsert', async () => {
    const { client, calls } = createMockClient(2);

    const result = await ingestCrawlPayload(client, makePayload(), NOW);

    expect(result).toMatchObject({
      source: 'mcdonalds-kr',
      brandId: 'brand-id',
      couponsUpserted: 2,
      couponsDeactivated: 2,
    });

    const couponUpsertIndex = calls.findIndex(
      (call) => call.table === 'coupons' && call.method === 'upsert'
    );
    const deactivateIndex = calls.findIndex(
      (call) => call.table === 'coupons' && call.method === 'update'
    );
    expect(deactivateIndex).toBeGreaterThan(couponUpsertIndex);

    expect(calls[deactivateIndex].args).toEqual([
      {
        is_active: false,
        updated_at: '2026-06-02T03:00:00.000Z',
      },
      { count: 'exact' },
    ]);
    expect(
      calls.filter((call) => call.table === 'coupons' && call.method === 'eq')
    ).toEqual([
      { table: 'coupons', method: 'eq', args: ['brand_id', 'brand-id'] },
      { table: 'coupons', method: 'eq', args: ['source', 'mcdonalds-kr'] },
      { table: 'coupons', method: 'eq', args: ['is_active', true] },
    ]);
    expect(
      calls.find((call) => call.table === 'coupons' && call.method === 'not')
    ).toEqual({
      table: 'coupons',
      method: 'not',
      args: [
        'content_hash',
        'in',
        expect.stringMatching(/^\("[a-f0-9]{64}","[a-f0-9]{64}"\)$/),
      ],
    });
  });

  it('uses content_hash as the upsert identity when source-side coupon id is missing', async () => {
    const { client, calls } = createMockClient();

    await ingestCrawlPayload(
      client,
      makePayload({
        coupons: [
          {
            external_id: null,
            title: '아이디 없는 쿠폰',
            discount_type: '정액',
            discount_value: 2000,
            valid_until: null,
          },
        ],
      }),
      NOW
    );

    const couponUpsert = calls.find(
      (call) => call.table === 'coupons' && call.method === 'upsert'
    );
    expect(couponUpsert?.args[1]).toEqual({
      onConflict: 'brand_id,source,content_hash',
    });
    expect(couponUpsert?.args[0]).toEqual([
      expect.objectContaining({
        external_id: null,
        content_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    ]);
  });

  it('does not deactivate coupons when the payload coupon snapshot is empty', async () => {
    const { client, calls } = createMockClient(10);

    const result = await ingestCrawlPayload(client, makePayload({ coupons: [] }), NOW);

    expect(result).toMatchObject({
      couponsUpserted: 0,
      couponsDeactivated: 0,
    });
    expect(
      calls.some((call) => call.table === 'coupons' && call.method === 'update')
    ).toBe(false);
  });
});
