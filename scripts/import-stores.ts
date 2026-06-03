import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  brandKeyId,
  brandKeyLabel,
  buildManualStoreUpsertRows,
  getManualStoreBrandKeys,
  parseManualStoresCsv,
  type ManualStoreBrandKey,
  type ManualStoreImportSummary,
} from '../lib/ingest/manualStores.ts';
import { loadLocalEnvFiles } from '../lib/ingest/localEnv.ts';
import { createServerSupabaseClient } from '../lib/ingest/supabase.ts';
import type { StoreUpsertRow } from '../lib/ingest/rows.ts';

export interface ImportStoresArgs {
  file: string;
  dryRun: boolean;
}

interface SupabaseResult<T> {
  data: T | null;
  error: { message: string } | null;
}

interface BrandLookupRow {
  id: string;
  source: string;
  external_id: string | null;
}

export function parseArgs(
  argv: string[],
  env: Record<string, string | undefined> = process.env
): ImportStoresArgs {
  let file = env.STORES_CSV ?? 'data/stores.example.csv';
  let dryRun = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--dry-run') {
      dryRun = true;
      continue;
    }

    if (arg === '--file') {
      const next = argv[index + 1];
      if (!next || next.startsWith('--')) {
        throw new Error('--file requires a CSV path');
      }
      file = next;
      index += 1;
      continue;
    }

    if (arg.startsWith('--file=')) {
      file = arg.slice('--file='.length);
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (file.trim().length === 0) {
    throw new Error('--file must not be empty');
  }

  return { file, dryRun };
}

export async function runImportStores(
  args: ImportStoresArgs,
  dependencies: {
    readCsv?: (file: string) => Promise<string>;
    createClient?: () => SupabaseClient;
    now?: () => Date;
  } = {}
): Promise<ManualStoreImportSummary> {
  const readCsv = dependencies.readCsv ?? ((file) => readFile(file, 'utf8'));
  const now = dependencies.now ?? (() => new Date());
  const csv = await readCsv(args.file);
  const records = parseManualStoresCsv(csv);
  const brands = getManualStoreBrandKeys(records);

  if (args.dryRun) {
    return {
      file: args.file,
      dryRun: true,
      stores: records.length,
      brands,
    };
  }

  const client = (dependencies.createClient ?? createServerSupabaseClient)();
  const brandIdsByKey = await resolveBrandIds(client, brands);
  const storeRows = buildManualStoreUpsertRows(
    records,
    brandIdsByKey,
    now().toISOString()
  );
  await upsertStores(client, storeRows);

  return {
    file: args.file,
    dryRun: false,
    stores: records.length,
    brands,
    upserted: storeRows.length,
  };
}

export async function resolveBrandIds(
  client: SupabaseClient,
  keys: readonly ManualStoreBrandKey[]
): Promise<Map<string, string>> {
  const resolved = new Map<string, string>();

  for (const key of keys) {
    let query = client
      .from('brands')
      .select('id,source,external_id')
      .eq('external_id', key.brand_external_id);

    if (key.brand_source) {
      query = query.eq('source', key.brand_source);
    }

    const result = (await query) as SupabaseResult<BrandLookupRow[]>;
    assertNoSupabaseError(result, `resolve brand ${brandKeyLabel(key)}`);

    const rows = result.data ?? [];
    if (rows.length === 0) {
      throw new Error(`No brand found for ${brandKeyLabel(key)}.`);
    }
    if (rows.length > 1) {
      throw new Error(
        `Multiple brands found for ${brandKeyLabel(key)}. Add brand_source to the CSV row.`
      );
    }

    resolved.set(brandKeyId(key), rows[0].id);
  }

  return resolved;
}

async function upsertStores(
  client: SupabaseClient,
  rows: readonly StoreUpsertRow[]
): Promise<void> {
  if (rows.length === 0) return;

  const result = (await client.from('stores').upsert(rows, {
    onConflict: 'brand_id,source,external_id',
  })) as SupabaseResult<unknown>;
  assertNoSupabaseError(result, 'upsert stores');
}

function assertNoSupabaseError(
  result: SupabaseResult<unknown>,
  operation: string
): void {
  if (result.error) {
    throw new Error(`Supabase ${operation} failed: ${result.error.message}`);
  }
}

export async function main(
  argv = process.argv.slice(2),
  env: Record<string, string | undefined> = process.env
): Promise<ManualStoreImportSummary> {
  loadLocalEnvFiles();
  const args = parseArgs(argv, env);
  const summary = await runImportStores(args);
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
