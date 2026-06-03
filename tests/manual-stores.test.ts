import { describe, expect, it } from 'vitest';
import {
  brandKeyId,
  buildManualStoreUpsertRows,
  getManualStoreBrandKeys,
  parseManualStoresCsv,
} from '../lib/ingest/manualStores';

describe('manual store CSV import helpers', () => {
  it('parses store rows, trims values, defaults source, and handles quoted commas', () => {
    const records = parseManualStoresCsv(`brand_external_id,external_id,name,lat,lng,address
burgerking,bk-hongdae,"버거킹, 홍대점",37.5563,126.9236,"서울 마포구, 양화로"
`);

    expect(records).toEqual([
      {
        brand_source: null,
        brand_external_id: 'burgerking',
        source: 'manual',
        external_id: 'bk-hongdae',
        name: '버거킹, 홍대점',
        lat: 37.5563,
        lng: 126.9236,
        address: '서울 마포구, 양화로',
      },
    ]);
  });

  it('supports explicit brand source and store source columns', () => {
    const records = parseManualStoresCsv(`brand_source,brand_external_id,source,external_id,name,lat,lng,address
burgerking-kr-adb,burgerking,manual-seed,bk-gangnam,버거킹 강남점,37.4979,127.0276,
`);

    expect(records[0]).toMatchObject({
      brand_source: 'burgerking-kr-adb',
      brand_external_id: 'burgerking',
      source: 'manual-seed',
      address: null,
    });
  });

  it('rejects invalid coordinates and duplicate store identities', () => {
    expect(() =>
      parseManualStoresCsv(`brand_external_id,external_id,name,lat,lng
burgerking,bad,버거킹 좌표오류,999,126.9236
`)
    ).toThrow(/invalid lat/);

    expect(() =>
      parseManualStoresCsv(`brand_external_id,source,external_id,name,lat,lng
burgerking,manual,bk-hongdae,버거킹 홍대점,37.5563,126.9236
burgerking,manual,bk-hongdae,버거킹 홍대점,37.5563,126.9236
`)
    ).toThrow(/Duplicate store key/);
  });

  it('deduplicates brand keys and builds Supabase store upsert rows', () => {
    const records = parseManualStoresCsv(`brand_source,brand_external_id,source,external_id,name,lat,lng,address
burgerking-kr-adb,burgerking,manual,bk-hongdae,버거킹 홍대점,37.5563,126.9236,서울 마포구
burgerking-kr-adb,burgerking,manual,bk-gangnam,버거킹 강남점,37.4979,127.0276,서울 강남구
kfc-kr-adb,kfc,manual,kfc-jamsil,KFC 잠실점,37.5133,127.1002,서울 송파구
`);
    const brandKeys = getManualStoreBrandKeys(records);
    const brandIds = new Map([
      [brandKeyId(brandKeys[0]), 'brand-burgerking'],
      [brandKeyId(brandKeys[1]), 'brand-kfc'],
    ]);

    expect(brandKeys).toEqual([
      { brand_source: 'burgerking-kr-adb', brand_external_id: 'burgerking' },
      { brand_source: 'kfc-kr-adb', brand_external_id: 'kfc' },
    ]);
    expect(buildManualStoreUpsertRows(records, brandIds, '2026-06-02T03:00:00.000Z')).toEqual([
      {
        brand_id: 'brand-burgerking',
        source: 'manual',
        external_id: 'bk-hongdae',
        name: '버거킹 홍대점',
        lat: 37.5563,
        lng: 126.9236,
        address: '서울 마포구',
        updated_at: '2026-06-02T03:00:00.000Z',
        last_seen_at: '2026-06-02T03:00:00.000Z',
      },
      {
        brand_id: 'brand-burgerking',
        source: 'manual',
        external_id: 'bk-gangnam',
        name: '버거킹 강남점',
        lat: 37.4979,
        lng: 127.0276,
        address: '서울 강남구',
        updated_at: '2026-06-02T03:00:00.000Z',
        last_seen_at: '2026-06-02T03:00:00.000Z',
      },
      {
        brand_id: 'brand-kfc',
        source: 'manual',
        external_id: 'kfc-jamsil',
        name: 'KFC 잠실점',
        lat: 37.5133,
        lng: 127.1002,
        address: '서울 송파구',
        updated_at: '2026-06-02T03:00:00.000Z',
        last_seen_at: '2026-06-02T03:00:00.000Z',
      },
    ]);
  });
});
