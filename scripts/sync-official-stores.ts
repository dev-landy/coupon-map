import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  fetchOfficialStoreRecords,
  parseBrandList,
  renderStoresCsv,
  type StoreBrand,
} from './fetch-official-stores.ts';
import {
  runImportStores,
  type ImportStoresArgs,
} from './import-stores.ts';
import { loadLocalEnvFiles } from '../lib/ingest/localEnv.ts';
import type { ManualStoreImportSummary } from '../lib/ingest/manualStores.ts';
import { createServerSupabaseClient } from '../lib/ingest/supabase.ts';
import type { SupabaseClient } from '@supabase/supabase-js';

const DEFAULT_BRANDS: StoreBrand[] = ['burgerking', 'kfc'];
const VIRTUAL_STORE_FILE = 'official-store-api';

const BRAND_METADATA: Record<StoreBrand, {
  source: string;
  external_id: string;
  name: string;
  app_scheme: string | null;
  store_url: string;
  app_store_url: string | null;
}> = {
  burgerking: {
    source: 'burgerking-kr-adb',
    external_id: 'burgerking',
    name: '버거킹',
    app_scheme: 'burgerkingkorea://',
    store_url: 'https://www.burgerking.co.kr',
    app_store_url: 'https://play.google.com/store/apps/details?id=kr.co.burgerkinghybrid',
  },
  kfc: {
    source: 'kfc-kr-adb',
    external_id: 'kfc',
    name: 'KFC',
    app_scheme: null,
    store_url: 'https://www.kfckorea.com',
    app_store_url: 'https://play.google.com/store/apps/details?id=kfc_ko.kore.kg.kfc_korea',
  },
};

export interface SyncOfficialStoresArgs {
  brands: StoreBrand[];
  dryRun: boolean;
}

export interface SyncOfficialStoresSummary {
  dryRun: boolean;
  stores: number;
  counts: Record<StoreBrand, number>;
  import: ManualStoreImportSummary;
}

interface FetchLike {
  (
    input: string | URL,
    init?: {
      method?: string;
      headers?: Record<string, string>;
      body?: URLSearchParams;
    }
  ): Promise<Response>;
}

interface RunSyncOfficialStoresDependencies {
  fetch?: FetchLike;
  createClient?: () => SupabaseClient;
  ensureBrands?: (
    client: SupabaseClient,
    brands: readonly StoreBrand[],
    now: Date
  ) => Promise<void>;
  importStores?: (
    args: ImportStoresArgs,
    dependencies?: Parameters<typeof runImportStores>[1]
  ) => Promise<ManualStoreImportSummary>;
}

export function parseArgs(argv: string[]): SyncOfficialStoresArgs {
  let brands = DEFAULT_BRANDS;
  let dryRun = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--dry-run') {
      dryRun = true;
      continue;
    }

    if (arg === '--brands') {
      const next = argv[index + 1];
      if (!next || next.startsWith('--')) {
        throw new Error('--brands requires a comma-separated brand list');
      }
      brands = parseBrandList(next);
      index += 1;
      continue;
    }

    if (arg.startsWith('--brands=')) {
      brands = parseBrandList(arg.slice('--brands='.length));
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return { brands, dryRun };
}

export async function runSyncOfficialStores(
  args: SyncOfficialStoresArgs,
  dependencies: RunSyncOfficialStoresDependencies = {}
): Promise<SyncOfficialStoresSummary> {
  const fetcher = dependencies.fetch ?? fetch;
  const createClient = dependencies.createClient ?? createServerSupabaseClient;
  const ensureBrands = dependencies.ensureBrands ?? upsertOfficialStoreBrands;
  const importStores = dependencies.importStores ?? runImportStores;
  const result = await fetchOfficialStoreRecords(args.brands, fetcher);
  const csv = renderStoresCsv(result.records);
  let client: SupabaseClient | null = null;
  const getClient = (): SupabaseClient => {
    client ??= createClient();
    return client;
  };

  if (!args.dryRun) {
    await ensureBrands(getClient(), args.brands, new Date());
  }

  const importSummary = await importStores(
    {
      file: VIRTUAL_STORE_FILE,
      dryRun: args.dryRun,
    },
    {
      readCsv: async () => csv,
      createClient: getClient,
    }
  );

  return {
    dryRun: args.dryRun,
    stores: result.records.length,
    counts: result.counts,
    import: importSummary,
  };
}

export async function upsertOfficialStoreBrands(
  client: SupabaseClient,
  brands: readonly StoreBrand[],
  now: Date = new Date()
): Promise<void> {
  const fetchedAt = now.toISOString();
  const rows = brands.map((brand) => ({
    ...BRAND_METADATA[brand],
    updated_at: fetchedAt,
    last_seen_at: fetchedAt,
  }));

  const result = await client.from('brands').upsert(rows, {
    onConflict: 'source,external_id',
  }) as { error: { message: string } | null };
  if (result.error) {
    throw new Error(`Supabase upsert official store brands failed: ${result.error.message}`);
  }
}

export async function main(
  argv = process.argv.slice(2)
): Promise<SyncOfficialStoresSummary> {
  loadLocalEnvFiles();
  const args = parseArgs(argv);
  const summary = await runSyncOfficialStores(args);
  console.log(JSON.stringify(summary, null, 2));
  return summary;
}

function isMainModule(moduleUrl: string, entrypoint: string | undefined): boolean {
  if (!entrypoint) return false;
  return fileURLToPath(moduleUrl) === resolve(entrypoint);
}

if (isMainModule(import.meta.url, process.argv[1])) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  });
}
