import { tmpdir } from 'node:os';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import {
  createCrawlAllSummary,
  hasCrawlFailures,
  main,
  parseArgs,
  parseSourceList,
  runCrawlAll,
  writeCrawlAllSummary,
} from '../scripts/crawl-all';
import type {
  CrawlAdapter,
  CrawlPayload,
  IngestResult,
} from '../lib/ingest/types';

const NOW = new Date('2026-06-02T03:00:00.000Z');

function makePayload(source: string): CrawlPayload {
  return {
    brand: {
      source,
      external_id: `${source}-brand`,
      name: `${source} brand`,
      app_scheme: null,
      store_url: 'https://example.com',
      app_store_url: null,
    },
    stores: [
      {
        external_id: `${source}-store`,
        name: `${source} store`,
        lat: 37.5563,
        lng: 126.9236,
        address: null,
      },
    ],
    coupons: [
      {
        external_id: `${source}-coupon`,
        title: `${source} coupon`,
        discount_type: '정액',
        discount_value: 1000,
        valid_until: null,
      },
    ],
  };
}

function makeAdapter(source: string, payload = makePayload(source)): CrawlAdapter {
  return {
    source,
    async crawl() {
      return payload;
    },
  };
}

describe('crawl-all argument parsing', () => {
  it('parses a comma-separated --sources list and dry-run flag', () => {
    expect(parseArgs(['--sources', 'fixture, mcdonalds-kr', '--dry-run'], {})).toEqual({
      sources: ['fixture', 'mcdonalds-kr'],
      dryRun: true,
    });
  });

  it('parses --output without changing printed summary behavior', () => {
    expect(
      parseArgs(['--sources=fixture', '--output', 'tmp/crawl-summary.json'], {})
    ).toEqual({
      sources: ['fixture'],
      dryRun: false,
      output: 'tmp/crawl-summary.json',
    });
    expect(parseArgs(['--sources=fixture', '--output=tmp/crawl-summary.json'], {})).toEqual({
      sources: ['fixture'],
      dryRun: false,
      output: 'tmp/crawl-summary.json',
    });
    expect(() => parseArgs(['--sources=fixture', '--output'], {})).toThrow(
      /--output requires/
    );
  });

  it('supports --sources=value and lets CLI sources override CRAWL_SOURCES', () => {
    expect(
      parseArgs(['--sources=fixture'], {
        CRAWL_SOURCES: 'mcdonalds-kr',
      })
    ).toEqual({
      sources: ['fixture'],
      dryRun: false,
    });
  });

  it('falls back to CRAWL_SOURCES', () => {
    expect(parseArgs([], { CRAWL_SOURCES: 'fixture,mcdonalds-kr' })).toEqual({
      sources: ['fixture', 'mcdonalds-kr'],
      dryRun: false,
    });
  });

  it('rejects missing, empty, and duplicate sources', () => {
    expect(() => parseArgs([], {})).toThrow(/Provide --sources/);
    expect(() => parseSourceList('fixture,,mcdonalds-kr')).toThrow(/empty source/);
    expect(() => parseSourceList('fixture, fixture')).toThrow(/duplicate source/);
  });
});

describe('crawl-all summary helpers', () => {
  it('builds countable success and failure summaries', () => {
    const summary = createCrawlAllSummary(
      {
        sources: ['fixture', 'missing'],
        dryRun: true,
      },
      [
        {
          status: 'success',
          value: {
            source: 'fixture',
            brand: 'Fixture Brand',
            stores: 1,
            coupons: 1,
            fetched_at: '2026-06-02T03:00:00.000Z',
            dryRun: true,
          },
        },
        {
          status: 'failure',
          value: {
            source: 'missing',
            error: 'boom',
          },
        },
      ],
      {
        startedAt: new Date('2026-06-02T03:00:00.000Z'),
        finishedAt: new Date('2026-06-02T03:00:02.500Z'),
      }
    );

    expect(summary).toMatchObject({
      started_at: '2026-06-02T03:00:00.000Z',
      finished_at: '2026-06-02T03:00:02.500Z',
      duration_ms: 2500,
      dryRun: true,
      sources: ['fixture', 'missing'],
      totalSources: 2,
      successCount: 1,
      failureCount: 1,
    });
    expect(summary.successes).toHaveLength(1);
    expect(summary.failures).toEqual([{ source: 'missing', error: 'boom' }]);
    expect(hasCrawlFailures(summary)).toBe(true);
  });
});

describe('crawl-all summary output', () => {
  it('prints the summary and writes the same JSON when --output is provided', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'crawl-all-'));
    const outputPath = join(dir, 'summary.json');
    const logs: string[] = [];
    const originalLog = console.log;

    try {
      console.log = (message?: unknown) => {
        logs.push(String(message));
      };

      await main(['--sources=fixture', '--dry-run', '--output', outputPath], {});

      expect(logs).toHaveLength(1);
      await expect(readFile(outputPath, 'utf8')).resolves.toBe(`${logs[0]}\n`);
      expect(JSON.parse(logs[0])).toMatchObject({
        dryRun: true,
        sources: ['fixture'],
        totalSources: 1,
        successCount: 1,
        failureCount: 0,
      });
    } finally {
      console.log = originalLog;
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('writes the same formatted summary JSON to a file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'crawl-all-'));
    const outputPath = join(dir, 'nested', 'summary.json');
    const summary = createCrawlAllSummary(
      {
        sources: ['fixture'],
        dryRun: true,
      },
      [],
      {
        startedAt: NOW,
        finishedAt: NOW,
      }
    );

    try {
      await writeCrawlAllSummary(outputPath, summary);

      await expect(readFile(outputPath, 'utf8')).resolves.toBe(
        `${JSON.stringify(summary, null, 2)}\n`
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('runCrawlAll', () => {
  it('continues after a per-source failure and reports failed exit state', async () => {
    const writes: string[] = [];
    const times = [
      new Date('2026-06-02T03:00:00.000Z'),
      new Date('2026-06-02T03:00:01.000Z'),
      new Date('2026-06-02T03:00:02.000Z'),
      new Date('2026-06-02T03:00:05.000Z'),
    ];
    let timeIndex = 0;
    const summary = await runCrawlAll(
      {
        sources: ['ok-a', 'bad', 'ok-b'],
        dryRun: false,
      },
      {
        getAdapter(source) {
          if (source === 'bad') {
            return {
              source,
              async crawl() {
                throw new Error('crawl failed');
              },
            };
          }
          return makeAdapter(source);
        },
        createClient() {
          return {} as SupabaseClient;
        },
        async ingest(_client, payload): Promise<IngestResult> {
          writes.push(payload.brand.source);
          return {
            source: payload.brand.source,
            brandId: `${payload.brand.source}-id`,
            storesUpserted: payload.stores.length,
            couponsUpserted: payload.coupons.length,
          };
        },
        now: () => times[timeIndex++] ?? times[times.length - 1],
      }
    );

    expect(writes).toEqual(['ok-a', 'ok-b']);
    expect(summary).toMatchObject({
      started_at: '2026-06-02T03:00:00.000Z',
      finished_at: '2026-06-02T03:00:05.000Z',
      duration_ms: 5000,
      totalSources: 3,
    });
    expect(summary.successCount).toBe(2);
    expect(summary.failureCount).toBe(1);
    expect(summary.failures).toEqual([{ source: 'bad', error: 'crawl failed' }]);
    expect(hasCrawlFailures(summary)).toBe(true);
  });

  it('dry-runs by crawling and normalizing without creating a Supabase client', async () => {
    let createdClient = false;
    let ingested = false;

    const summary = await runCrawlAll(
      {
        sources: ['fixture'],
        dryRun: true,
      },
      {
        getAdapter: (source) => makeAdapter(source),
        createClient() {
          createdClient = true;
          return {} as SupabaseClient;
        },
        async ingest(): Promise<IngestResult> {
          ingested = true;
          throw new Error('dry-run should not write');
        },
        now: () => NOW,
      }
    );

    expect(createdClient).toBe(false);
    expect(ingested).toBe(false);
    expect(summary).toMatchObject({
      dryRun: true,
      successCount: 1,
      failureCount: 0,
      successes: [
        {
          source: 'fixture',
          brand: 'fixture brand',
          stores: 1,
          coupons: 1,
          fetched_at: '2026-06-02T03:00:00.000Z',
          dryRun: true,
        },
      ],
    });
  });
});
