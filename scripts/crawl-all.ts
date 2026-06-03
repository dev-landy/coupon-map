import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { SupabaseClient } from '@supabase/supabase-js';

import { getCrawlAdapter } from '../lib/ingest/adapters/index.ts';
import { loadLocalEnvFiles } from '../lib/ingest/localEnv.ts';
import { normalizeCrawlPayload } from '../lib/ingest/normalize.ts';
import {
  createServerSupabaseClient,
  ingestCrawlPayload,
} from '../lib/ingest/supabase.ts';
import type {
  CrawlAdapter,
  CrawlPayload,
  IngestResult,
} from '../lib/ingest/types.ts';

export interface CrawlAllArgs {
  sources: string[];
  dryRun: boolean;
  output?: string;
}

export interface CrawlSourceSuccess {
  source: string;
  brand: string;
  stores: number;
  coupons: number;
  fetched_at: string;
  dryRun: boolean;
  ingest?: IngestResult;
}

export interface CrawlSourceFailure {
  source: string;
  error: string;
}

export type CrawlSourceResult =
  | { status: 'success'; value: CrawlSourceSuccess }
  | { status: 'failure'; value: CrawlSourceFailure };

export interface CrawlAllSummary {
  started_at: string;
  finished_at: string;
  duration_ms: number;
  dryRun: boolean;
  sources: string[];
  totalSources: number;
  successCount: number;
  failureCount: number;
  successes: CrawlSourceSuccess[];
  failures: CrawlSourceFailure[];
}

interface RunCrawlAllDependencies {
  getAdapter?: (source: string) => CrawlAdapter;
  createClient?: () => SupabaseClient;
  ingest?: (
    client: SupabaseClient,
    payload: CrawlPayload,
    now?: Date
  ) => Promise<IngestResult>;
  now?: () => Date;
}

export function parseArgs(
  argv: string[],
  env: Record<string, string | undefined> = process.env
): CrawlAllArgs {
  let dryRun = false;
  let output: string | undefined;
  let sourcesValue = env.CRAWL_SOURCES;
  let sourcesLabel = 'CRAWL_SOURCES';

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--dry-run') {
      dryRun = true;
      continue;
    }

    if (arg === '--output') {
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) {
        throw new Error('--output requires a file path');
      }
      output = next;
      i += 1;
      continue;
    }

    if (arg.startsWith('--output=')) {
      const value = arg.slice('--output='.length);
      if (value.length === 0) {
        throw new Error('--output requires a file path');
      }
      output = value;
      continue;
    }

    if (arg === '--sources') {
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) {
        throw new Error('--sources requires a comma-separated source list');
      }
      sourcesValue = next;
      sourcesLabel = '--sources';
      i += 1;
      continue;
    }

    if (arg.startsWith('--sources=')) {
      sourcesValue = arg.slice('--sources='.length);
      sourcesLabel = '--sources';
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (sourcesValue === undefined) {
    throw new Error('Provide --sources source-a,source-b or set CRAWL_SOURCES.');
  }

  const parsed: CrawlAllArgs = {
    sources: parseSourceList(sourcesValue, sourcesLabel),
    dryRun,
  };
  if (output) {
    parsed.output = output;
  }

  return parsed;
}

export function parseSourceList(value: string, label = 'sources'): string[] {
  if (value.trim().length === 0) {
    throw new Error(`${label} must include at least one source`);
  }

  const sources = value.split(',').map((source) => source.trim());
  const emptyIndex = sources.findIndex((source) => source.length === 0);
  if (emptyIndex !== -1) {
    throw new Error(`${label} contains an empty source at position ${emptyIndex + 1}`);
  }

  const seen = new Set<string>();
  for (const source of sources) {
    if (seen.has(source)) {
      throw new Error(`${label} contains duplicate source: ${source}`);
    }
    seen.add(source);
  }

  return sources;
}

export function createCrawlAllSummary(
  args: CrawlAllArgs,
  results: CrawlSourceResult[],
  timing: { startedAt?: Date; finishedAt?: Date } = {}
): CrawlAllSummary {
  const successes = results
    .filter((result): result is { status: 'success'; value: CrawlSourceSuccess } => {
      return result.status === 'success';
    })
    .map((result) => result.value);
  const failures = results
    .filter((result): result is { status: 'failure'; value: CrawlSourceFailure } => {
      return result.status === 'failure';
    })
    .map((result) => result.value);

  const startedAt = timing.startedAt ?? new Date();
  const finishedAt = timing.finishedAt ?? startedAt;

  return {
    started_at: startedAt.toISOString(),
    finished_at: finishedAt.toISOString(),
    duration_ms: Math.max(0, finishedAt.getTime() - startedAt.getTime()),
    dryRun: args.dryRun,
    sources: args.sources,
    totalSources: args.sources.length,
    successCount: successes.length,
    failureCount: failures.length,
    successes,
    failures,
  };
}

export function hasCrawlFailures(summary: CrawlAllSummary): boolean {
  return summary.failureCount > 0;
}

export function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function writeCrawlAllSummary(
  outputPath: string,
  summary: CrawlAllSummary
): Promise<void> {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
}

export async function runCrawlAll(
  args: CrawlAllArgs,
  dependencies: RunCrawlAllDependencies = {}
): Promise<CrawlAllSummary> {
  const adapterFor = dependencies.getAdapter ?? getCrawlAdapter;
  const createClient = dependencies.createClient ?? createServerSupabaseClient;
  const ingest = dependencies.ingest ?? ingestCrawlPayload;
  const now = dependencies.now ?? (() => new Date());
  const startedAt = now();

  let client: SupabaseClient | null = null;
  const getClient = (): SupabaseClient => {
    client ??= createClient();
    return client;
  };

  const results: CrawlSourceResult[] = [];
  for (const source of args.sources) {
    try {
      const adapter = adapterFor(source);
      const payload = await adapter.crawl();
      const crawlTime = now();
      const normalized = normalizeCrawlPayload(payload, crawlTime);
      const success: CrawlSourceSuccess = {
        source: normalized.brand.source,
        brand: normalized.brand.name,
        stores: normalized.stores.length,
        coupons: normalized.coupons.length,
        fetched_at: normalized.fetched_at,
        dryRun: args.dryRun,
      };

      if (!args.dryRun) {
        success.ingest = await ingest(getClient(), payload, crawlTime);
      }

      results.push({ status: 'success', value: success });
    } catch (error: unknown) {
      results.push({
        status: 'failure',
        value: {
          source,
          error: formatError(error),
        },
      });
    }
  }

  const finishedAt = now();
  return createCrawlAllSummary(args, results, { startedAt, finishedAt });
}

export async function main(
  argv = process.argv.slice(2),
  env: Record<string, string | undefined> = process.env
): Promise<CrawlAllSummary> {
  loadLocalEnvFiles();
  const args = parseArgs(argv, env);
  const summary = await runCrawlAll(args);
  const json = JSON.stringify(summary, null, 2);
  console.log(json);
  if (args.output) {
    await writeCrawlAllSummary(args.output, summary);
  }
  if (hasCrawlFailures(summary)) {
    process.exitCode = 1;
  }
  return summary;
}

function createFatalSummary(error: unknown): CrawlAllSummary {
  return createCrawlAllSummary(
    { dryRun: false, sources: [] },
    [
      {
        status: 'failure',
        value: {
          source: 'crawl-all',
          error: formatError(error),
        },
      },
    ]
  );
}

function isMainModule(moduleUrl: string, entrypoint: string | undefined): boolean {
  if (!entrypoint) return false;
  return fileURLToPath(moduleUrl) === resolve(entrypoint);
}

if (isMainModule(import.meta.url, process.argv[1])) {
  main().catch((error: unknown) => {
    console.log(JSON.stringify(createFatalSummary(error), null, 2));
    process.exitCode = 1;
  });
}
