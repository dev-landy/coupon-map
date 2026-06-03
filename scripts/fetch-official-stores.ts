import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_OUTPUT = 'data/stores.official.csv';
const DEFAULT_BRANDS = ['burgerking', 'kfc'] as const;
const STORE_SOURCE = 'official-web';

export type StoreBrand = (typeof DEFAULT_BRANDS)[number];

export interface FetchOfficialStoresArgs {
  brands: StoreBrand[];
  output: string;
}

export interface OfficialStoreRecord {
  brand_source: string;
  brand_external_id: string;
  source: string;
  external_id: string;
  name: string;
  lat: number;
  lng: number;
  address: string | null;
}

export interface FetchOfficialStoresSummary {
  output: string;
  stores: number;
  counts: Record<StoreBrand, number>;
}

export interface FetchOfficialStoreRecordsResult {
  records: OfficialStoreRecord[];
  counts: Record<StoreBrand, number>;
}

interface BurgerKingStoreRow {
  storCd?: string;
  storNm?: string;
  storAddr?: string;
  storCoordY?: string;
  storCoordX?: string;
}

interface BurgerKingStoreResponse {
  header?: {
    result?: boolean;
    error_text?: string;
  };
  body?: {
    searchTotalCount?: string | number;
    storInfo?: BurgerKingStoreRow[];
  };
}

interface KfcSessionResponse {
  csrf?: {
    token?: string;
    headerName?: string;
  };
}

interface KfcStoreRow {
  store_index?: string | number;
  store_code?: string | number;
  store_name?: string;
  store_new_address?: string;
  store_new_address_detail?: string;
  store_latitude?: string | number;
  store_longitude?: string | number;
}

interface KfcStoreListResponse {
  total?: number;
  rows?: KfcStoreRow[];
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

interface RunFetchOfficialStoresDependencies {
  fetch?: FetchLike;
  writeCsv?: (output: string, csv: string) => Promise<void>;
}

export function parseArgs(argv: string[]): FetchOfficialStoresArgs {
  let output = DEFAULT_OUTPUT;
  let brandsValue: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--output') {
      const next = argv[index + 1];
      if (!next || next.startsWith('--')) {
        throw new Error('--output requires a file path');
      }
      output = next;
      index += 1;
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

    if (arg === '--brands') {
      const next = argv[index + 1];
      if (!next || next.startsWith('--')) {
        throw new Error('--brands requires a comma-separated brand list');
      }
      brandsValue = next;
      index += 1;
      continue;
    }

    if (arg.startsWith('--brands=')) {
      brandsValue = arg.slice('--brands='.length);
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  const brands = brandsValue
    ? parseBrandList(brandsValue)
    : [...DEFAULT_BRANDS];
  if (output.trim().length === 0) {
    throw new Error('--output must not be empty');
  }

  return { brands, output };
}

export function parseBrandList(value: string): StoreBrand[] {
  if (value.trim().length === 0) {
    throw new Error('--brands must include at least one brand');
  }

  const seen = new Set<string>();
  return value.split(',').map((brand, index) => {
    const normalized = brand.trim().toLowerCase();
    if (!isStoreBrand(normalized)) {
      throw new Error(`Unknown brand at position ${index + 1}: ${brand}`);
    }
    if (seen.has(normalized)) {
      throw new Error(`--brands contains duplicate brand: ${normalized}`);
    }
    seen.add(normalized);
    return normalized;
  });
}

export async function runFetchOfficialStores(
  args: FetchOfficialStoresArgs,
  dependencies: RunFetchOfficialStoresDependencies = {}
): Promise<FetchOfficialStoresSummary> {
  const fetcher = dependencies.fetch ?? fetch;
  const writeCsv = dependencies.writeCsv ?? writeCsvFile;
  const result = await fetchOfficialStoreRecords(args.brands, fetcher);

  await writeCsv(args.output, renderStoresCsv(result.records));

  return {
    output: args.output,
    stores: result.records.length,
    counts: result.counts,
  };
}

export async function fetchOfficialStoreRecords(
  brands: readonly StoreBrand[],
  fetcher: FetchLike = fetch
): Promise<FetchOfficialStoreRecordsResult> {
  const records: OfficialStoreRecord[] = [];
  const counts: Record<StoreBrand, number> = {
    burgerking: 0,
    kfc: 0,
  };

  for (const brand of brands) {
    const brandRecords = brand === 'burgerking'
      ? await fetchBurgerKingStores(fetcher)
      : await fetchKfcStores(fetcher);
    records.push(...brandRecords);
    counts[brand] = brandRecords.length;
  }

  records.sort((a, b) => {
    const brandCompare = a.brand_external_id.localeCompare(b.brand_external_id, 'ko');
    if (brandCompare !== 0) return brandCompare;
    const nameCompare = a.name.localeCompare(b.name, 'ko');
    if (nameCompare !== 0) return nameCompare;
    return a.external_id.localeCompare(b.external_id, 'ko');
  });

  return { records, counts };
}

export async function fetchBurgerKingStores(
  fetcher: FetchLike = fetch
): Promise<OfficialStoreRecord[]> {
  const pageSize = 500;
  const records: OfficialStoreRecord[] = [];
  let total: number | null = null;

  for (let page = 1; page <= 20; page += 1) {
    const response = await postBurgerKingStorePage(fetcher, page, pageSize);
    const rows = response.body?.storInfo ?? [];
    total = Number(response.body?.searchTotalCount ?? rows.length);
    records.push(...rows.map(toBurgerKingStoreRecord).filter(isDefined));

    if (rows.length === 0 || records.length >= total) {
      break;
    }
  }

  return dedupeStores(records);
}

export async function fetchKfcStores(
  fetcher: FetchLike = fetch
): Promise<OfficialStoreRecord[]> {
  const sessionResponse = await fetcher('https://www.kfckorea.com/kfc/interface/session');
  assertOk(sessionResponse, 'KFC session');
  const session = (await sessionResponse.json()) as KfcSessionResponse;
  const csrfToken = session.csrf?.token;
  const csrfHeaderName = session.csrf?.headerName ?? 'X-CSRF-TOKEN';
  if (!csrfToken) {
    throw new Error('KFC session response did not include a CSRF token.');
  }

  const cookieHeader = getCookieHeader(sessionResponse.headers);
  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    [csrfHeaderName]: csrfToken,
  };
  if (cookieHeader) {
    headers.Cookie = cookieHeader;
  }

  const response = await fetcher('https://www.kfckorea.com/kfc/interface/selectStoreList', {
    method: 'POST',
    headers,
    body: new URLSearchParams({
      device: 'WEB',
      store_search: '',
      sido_search: '',
      gugun_search: '',
      show_search: 'Y',
      store_show_type: '',
      sales_code_search: '',
      initYn: 'N',
      lat_search: '',
      lng_search: '',
      rows: '1000',
    }),
  });
  assertOk(response, 'KFC store list');

  const payload = (await response.json()) as KfcStoreListResponse;
  const rows = payload.rows ?? [];
  return dedupeStores(rows.map(toKfcStoreRecord).filter(isDefined));
}

export function renderStoresCsv(records: readonly OfficialStoreRecord[]): string {
  const header = [
    'brand_source',
    'brand_external_id',
    'source',
    'external_id',
    'name',
    'lat',
    'lng',
    'address',
  ];
  const lines = records.map((record) => {
    return [
      record.brand_source,
      record.brand_external_id,
      record.source,
      record.external_id,
      record.name,
      String(record.lat),
      String(record.lng),
      record.address ?? '',
    ].map(csvField).join(',');
  });

  return `${[header.join(','), ...lines].join('\n')}\n`;
}

async function postBurgerKingStorePage(
  fetcher: FetchLike,
  page: number,
  pageSize: number
): Promise<BurgerKingStoreResponse> {
  const response = await fetcher(
    'https://web-prd.burgerking.co.kr/burgerking/BKR0343.json',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Accept-Language': 'ko',
      },
      body: new URLSearchParams({
        message: JSON.stringify({
          header: {
            result: true,
            error_code: '',
            error_text: '',
            info_text: '',
            message_version: '',
            login_session_id: '',
            trcode: 'BKR0343',
            cd_call_chnn: '01',
          },
          body: {
            dataCount: String(pageSize),
            membershipYn: '',
            orderType: '01',
            page: String(page),
            searchKeyword: '',
            serviceCode: [],
            sort: '02',
            yCoordinates: '37.5726506',
            xCoordinates: '126.9810922',
            isAllYn: 'Y',
          },
        }),
      }),
    }
  );
  assertOk(response, `Burger King store page ${page}`);

  const payload = (await response.json()) as BurgerKingStoreResponse;
  if (payload.header?.result === false) {
    throw new Error(payload.header.error_text || 'Burger King store API failed.');
  }
  return payload;
}

function toBurgerKingStoreRecord(row: BurgerKingStoreRow): OfficialStoreRecord | null {
  const externalId = normalizeText(row.storCd);
  const rawName = normalizeText(row.storNm);
  const lat = parseCoordinate(row.storCoordY);
  const lng = parseCoordinate(row.storCoordX);
  if (!externalId || !rawName || lat === null || lng === null) {
    return null;
  }

  return {
    brand_source: 'burgerking-kr-adb',
    brand_external_id: 'burgerking',
    source: STORE_SOURCE,
    external_id: externalId,
    name: addNamePrefix(rawName, '버거킹'),
    lat,
    lng,
    address: normalizeText(row.storAddr),
  };
}

function toKfcStoreRecord(row: KfcStoreRow): OfficialStoreRecord | null {
  const externalId = normalizeText(row.store_code) ?? normalizeText(row.store_index);
  const rawName = normalizeText(row.store_name);
  const lat = parseCoordinate(row.store_latitude);
  const lng = parseCoordinate(row.store_longitude);
  if (!externalId || !rawName || lat === null || lng === null) {
    return null;
  }

  return {
    brand_source: 'kfc-kr-adb',
    brand_external_id: 'kfc',
    source: STORE_SOURCE,
    external_id: externalId,
    name: addNamePrefix(rawName, 'KFC'),
    lat,
    lng,
    address: [row.store_new_address, row.store_new_address_detail]
      .map(normalizeText)
      .filter(isDefined)
      .join(' ') || null,
  };
}

function dedupeStores(records: readonly OfficialStoreRecord[]): OfficialStoreRecord[] {
  const deduped: OfficialStoreRecord[] = [];
  const seen = new Set<string>();

  for (const record of records) {
    const key = [
      record.brand_source,
      record.brand_external_id,
      record.source,
      record.external_id,
    ].join('\u001f');
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(record);
  }

  return deduped;
}

async function writeCsvFile(outputPath: string, csv: string): Promise<void> {
  const resolvedPath = resolve(outputPath);
  await mkdir(dirname(resolvedPath), { recursive: true });
  await writeFile(resolvedPath, csv, 'utf8');
}

function getCookieHeader(headers: Headers): string | null {
  const getSetCookie = (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
  const cookies = getSetCookie ? getSetCookie.call(headers) : splitSetCookie(headers.get('set-cookie'));
  if (cookies.length === 0) return null;
  return cookies.map((cookie) => cookie.split(';')[0]).join('; ');
}

function splitSetCookie(value: string | null): string[] {
  if (!value) return [];
  return value.split(/,(?=\s*[^;,\s]+=)/).map((cookie) => cookie.trim());
}

function addNamePrefix(name: string, prefix: string): string {
  return name.startsWith(prefix) ? name : `${prefix} ${name}`;
}

function normalizeText(value: string | number | undefined | null): string | null {
  if (value === undefined || value === null) return null;
  const normalized = String(value).replace(/\s+/g, ' ').trim();
  return normalized.length > 0 ? normalized : null;
}

function parseCoordinate(value: string | number | undefined): number | null {
  if (value === undefined) return null;
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return null;
  if (numberValue === 0) return null;
  return numberValue;
}

function csvField(value: string): string {
  if (!/[",\n\r]/.test(value)) return value;
  return `"${value.replaceAll('"', '""')}"`;
}

function assertOk(response: Response, label: string): void {
  if (!response.ok) {
    throw new Error(`${label} failed: HTTP ${response.status}`);
  }
}

function isStoreBrand(value: string): value is StoreBrand {
  return DEFAULT_BRANDS.includes(value as StoreBrand);
}

function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

export async function main(
  argv = process.argv.slice(2)
): Promise<FetchOfficialStoresSummary> {
  const args = parseArgs(argv);
  const summary = await runFetchOfficialStores(args);
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
