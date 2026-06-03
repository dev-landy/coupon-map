import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { CrawlPayload, IngestResult } from './types.ts';
import { normalizeCrawlPayload } from './normalize.ts';
import {
  buildBrandUpsertRow,
  buildCouponUpsertRows,
  buildStoreUpsertRows,
  type CouponUpsertRow,
} from './rows.ts';

interface SupabaseMutationResult<T> {
  data: T | null;
  error: { message: string } | null;
  count?: number | null;
}

interface BrandIdRow {
  id: string;
}

export function createServerSupabaseClient(): SupabaseClient {
  const url = optionalEnv('SUPABASE_URL') ?? requiredEnv('NEXT_PUBLIC_SUPABASE_URL');
  const serviceRoleKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY');

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function ingestCrawlPayload(
  client: SupabaseClient,
  payload: CrawlPayload,
  now: Date = new Date()
): Promise<IngestResult> {
  const normalized = normalizeCrawlPayload(payload, now);
  const brandRow = buildBrandUpsertRow(normalized);

  const brandResult = (await client
    .from('brands')
    .upsert(brandRow, { onConflict: 'source,external_id' })
    .select('id')
    .single()) as SupabaseMutationResult<BrandIdRow>;
  assertNoSupabaseError(brandResult, 'upsert brand');

  const brandId = brandResult.data?.id;
  if (!brandId) throw new Error('Brand upsert did not return an id.');

  const storeRows = buildStoreUpsertRows(normalized, brandId);
  if (storeRows.length > 0) {
    const storeResult = (await client
      .from('stores')
      .upsert(storeRows, {
        onConflict: 'brand_id,source,external_id',
      })) as SupabaseMutationResult<unknown>;
    assertNoSupabaseError(storeResult, 'upsert stores');
  }

  const couponRows = buildCouponUpsertRows(normalized, brandId);
  let couponsDeactivated = 0;
  if (couponRows.length > 0) {
    const couponRowsWithExternalId = couponRows.filter(hasExternalCouponId);
    const couponRowsWithContentHashIdentity = couponRows.filter(
      (row) => row.external_id === null
    );

    await upsertCouponRows(
      client,
      couponRowsWithExternalId,
      'brand_id,source,external_id'
    );
    await upsertCouponRows(
      client,
      couponRowsWithContentHashIdentity,
      'brand_id,source,content_hash'
    );

    const deactivateResult = (await client
      .from('coupons')
      .update(
        {
          is_active: false,
          updated_at: normalized.fetched_at,
        },
        { count: 'exact' }
      )
      .eq('brand_id', brandId)
      .eq('source', normalized.brand.source)
      .eq('is_active', true)
      .not(
        'content_hash',
        'in',
        formatPostgrestInList(couponRows.map((row) => row.content_hash))
      )) as SupabaseMutationResult<unknown>;
    assertNoSupabaseError(deactivateResult, 'deactivate missing coupons');
    couponsDeactivated = deactivateResult.count ?? 0;
  }

  return {
    source: normalized.brand.source,
    brandId,
    storesUpserted: storeRows.length,
    couponsUpserted: couponRows.length,
    couponsDeactivated,
  };
}

function assertNoSupabaseError(
  result: SupabaseMutationResult<unknown>,
  operation: string
): void {
  if (result.error) {
    throw new Error(`Supabase ${operation} failed: ${result.error.message}`);
  }
}

async function upsertCouponRows(
  client: SupabaseClient,
  rows: readonly CouponUpsertRow[],
  onConflict: string
): Promise<void> {
  if (rows.length === 0) return;

  const result = (await client
    .from('coupons')
    .upsert(rows, { onConflict })) as SupabaseMutationResult<unknown>;
  assertNoSupabaseError(result, 'upsert coupons');
}

function hasExternalCouponId(
  row: CouponUpsertRow
): row is CouponUpsertRow & { external_id: string } {
  return row.external_id !== null;
}

function formatPostgrestInList(values: readonly string[]): string {
  const formattedValues = values.map((value) => {
    const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return `"${escaped}"`;
  });

  return `(${formattedValues.join(',')})`;
}

function requiredEnv(name: string): string {
  const value = optionalEnv(name);
  if (value === null) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalEnv(name: string): string | null {
  const value = process.env[name];
  if (!value || value.trim().length === 0) return null;
  return value.trim();
}
