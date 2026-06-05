import { describe, expect, it } from 'vitest';

import {
  parseArgs,
  runSyncOfficialStores,
} from '../scripts/sync-official-stores';
import type { ImportStoresArgs } from '../scripts/import-stores';
import type { ManualStoreImportSummary } from '../lib/ingest/manualStores';
import type { SupabaseClient } from '@supabase/supabase-js';

describe('official store Supabase sync', () => {
  it('parses dry-run and brand filter args', () => {
    expect(parseArgs([])).toEqual({
      brands: ['burgerking', 'kfc', 'mcdonalds'],
      dryRun: false,
    });
    expect(parseArgs(['--dry-run', '--brands', 'mcdonalds'])).toEqual({
      brands: ['mcdonalds'],
      dryRun: true,
    });
  });

  it('fetches official stores and passes generated CSV to the Supabase import flow', async () => {
    let importArgs: ImportStoresArgs | null = null;
    let importedCsv = '';

    const summary = await runSyncOfficialStores(
      { brands: ['burgerking', 'kfc', 'mcdonalds'], dryRun: false },
      {
        createClient: () => ({}) as SupabaseClient,
        ensureBrands: async () => undefined,
        fetch: async (input) => {
          const url = String(input);

          if (url.includes('BKR0343')) {
            return jsonResponse({
              header: { result: true },
              body: {
                searchTotalCount: '1',
                storInfo: [
                  {
                    storCd: '0001',
                    storNm: '강남점',
                    storAddr: '서울 강남구',
                    storCoordY: '37.5',
                    storCoordX: '127.0',
                  },
                ],
              },
            });
          }

          if (url.endsWith('/session')) {
            return jsonResponse(
              { csrf: { token: 'csrf-token', headerName: 'X-CSRF-TOKEN' } },
              { 'set-cookie': 'JSESSIONID=session-id; Path=/; HttpOnly' }
            );
          }

          if (url.endsWith('/selectStoreList')) {
            return jsonResponse({
              total: 1,
              rows: [
                {
                  store_code: '1420001',
                  store_name: '홍대입구',
                  store_new_address: '서울 마포구',
                  store_latitude: '37.55',
                  store_longitude: '126.92',
                },
              ],
            });
          }

          if (url.includes('mcdonalds.co.kr/api/v1/kor/store/list')) {
            return jsonResponse({
              resultCode: 100,
              resultObject: {
                totalCount: 1,
                list: [
                  {
                    code: '0545',
                    korName: '강남 2호점',
                    loadKor: '서울 강남구 테헤란로 107',
                    lat: '37.4986859',
                    lng: '127.0287553',
                  },
                ],
              },
            });
          }

          throw new Error(`Unexpected URL: ${url}`);
        },
        importStores: async (args, dependencies): Promise<ManualStoreImportSummary> => {
          importArgs = args;
          importedCsv = await dependencies?.readCsv?.(args.file) ?? '';
          return {
            file: args.file,
            dryRun: args.dryRun,
            stores: 3,
            brands: [
              { brand_source: 'burgerking-kr-adb', brand_external_id: 'burgerking' },
              { brand_source: 'kfc-kr-adb', brand_external_id: 'kfc' },
              { brand_source: 'mcdonalds-kr-adb', brand_external_id: 'mcdonalds' },
            ],
            upserted: 3,
          };
        },
      }
    );

    expect(importArgs).toEqual({
      file: 'official-store-api',
      dryRun: false,
    });
    expect(importedCsv).toContain('burgerking-kr-adb,burgerking,official-web,0001');
    expect(importedCsv).toContain('kfc-kr-adb,kfc,official-web,1420001');
    expect(importedCsv).toContain('mcdonalds-kr-adb,mcdonalds,official-web,0545');
    expect(summary).toMatchObject({
      dryRun: false,
      stores: 3,
      counts: { burgerking: 1, kfc: 1, mcdonalds: 1 },
    });
    expect(summary.import.upserted).toBe(3);
  });
});

function jsonResponse(body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
  });
}
