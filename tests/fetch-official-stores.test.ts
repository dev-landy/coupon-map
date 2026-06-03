import { describe, expect, it } from 'vitest';

import {
  parseArgs,
  parseBrandList,
  renderStoresCsv,
  runFetchOfficialStores,
} from '../scripts/fetch-official-stores';

describe('official store fetch helpers', () => {
  it('parses CLI args with defaults and brand filtering', () => {
    expect(parseArgs([])).toEqual({
      brands: ['burgerking', 'kfc'],
      output: 'data/stores.official.csv',
    });
    expect(parseArgs(['--brands=kfc', '--output', 'tmp/kfc.csv'])).toEqual({
      brands: ['kfc'],
      output: 'tmp/kfc.csv',
    });
    expect(() => parseBrandList('kfc,kfc')).toThrow(/duplicate brand/);
    expect(() => parseBrandList('lotteria')).toThrow(/Unknown brand/);
  });

  it('maps official API payloads into importable CSV records', async () => {
    const calls: string[] = [];
    let writtenCsv = '';

    const summary = await runFetchOfficialStores(
      { brands: ['burgerking', 'kfc'], output: 'data/stores.official.csv' },
      {
        fetch: async (input) => {
          const url = String(input);
          calls.push(url);

          if (url.includes('BKR0343')) {
            return jsonResponse({
              header: { result: true },
              body: {
                searchTotalCount: '1',
                storInfo: [
                  {
                    storCd: '0001',
                    storNm: '강남점',
                    storAddr: '서울 강남구  테헤란로',
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
                  store_new_address: '서울 마포구 양화로',
                  store_new_address_detail: '1층',
                  store_latitude: '37.55',
                  store_longitude: '126.92',
                },
              ],
            });
          }

          throw new Error(`Unexpected URL: ${url}`);
        },
        writeCsv: async (_output, csv) => {
          writtenCsv = csv;
        },
      }
    );

    expect(calls).toHaveLength(3);
    expect(summary).toEqual({
      output: 'data/stores.official.csv',
      stores: 2,
      counts: { burgerking: 1, kfc: 1 },
    });
    expect(writtenCsv).toContain(
      'burgerking-kr-adb,burgerking,official-web,0001,버거킹 강남점,37.5,127,서울 강남구 테헤란로'
    );
    expect(writtenCsv).toContain(
      'kfc-kr-adb,kfc,official-web,1420001,KFC 홍대입구,37.55,126.92,서울 마포구 양화로 1층'
    );
  });

  it('quotes CSV fields when names or addresses contain commas', () => {
    const csv = renderStoresCsv([
      {
        brand_source: 'burgerking-kr-adb',
        brand_external_id: 'burgerking',
        source: 'official-web',
        external_id: 'quoted',
        name: '버거킹 "테스트,점"',
        lat: 37.1,
        lng: 127.1,
        address: '서울, 테스트로',
      },
    ]);

    expect(csv).toContain('"버거킹 ""테스트,점"""');
    expect(csv).toContain('"서울, 테스트로"');
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
