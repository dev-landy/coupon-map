import type { StoreUpsertRow } from './rows.ts';

export interface ManualStoreCsvRecord {
  brand_source: string | null;
  brand_external_id: string;
  source: string;
  external_id: string;
  name: string;
  lat: number;
  lng: number;
  address: string | null;
}

export interface ManualStoreBrandKey {
  brand_source: string | null;
  brand_external_id: string;
}

export interface ManualStoreImportSummary {
  file: string;
  dryRun: boolean;
  stores: number;
  brands: ManualStoreBrandKey[];
  upserted?: number;
}

const REQUIRED_COLUMNS = ['brand_external_id', 'external_id', 'name', 'lat', 'lng'];
const DEFAULT_STORE_SOURCE = 'manual';

export function parseManualStoresCsv(csv: string): ManualStoreCsvRecord[] {
  const rows = parseCsvRows(csv);
  if (rows.length === 0) {
    throw new Error('CSV must include a header row.');
  }

  const headers = rows[0].map(normalizeHeader);
  const missingColumns = REQUIRED_COLUMNS.filter((column) => !headers.includes(column));
  if (missingColumns.length > 0) {
    throw new Error(`CSV is missing required column(s): ${missingColumns.join(', ')}`);
  }

  const records: ManualStoreCsvRecord[] = [];
  const seenStoreKeys = new Set<string>();
  for (let index = 1; index < rows.length; index += 1) {
    const rawRow = rows[index];
    if (rawRow.every((value) => value.trim().length === 0)) continue;

    const rowNumber = index + 1;
    const values = rowToObject(headers, rawRow);
    const record: ManualStoreCsvRecord = {
      brand_source: optionalText(values.brand_source),
      brand_external_id: requiredText(values.brand_external_id, rowNumber, 'brand_external_id'),
      source: optionalText(values.source) ?? DEFAULT_STORE_SOURCE,
      external_id: requiredText(values.external_id, rowNumber, 'external_id'),
      name: requiredText(values.name, rowNumber, 'name'),
      lat: parseCoordinate(values.lat, rowNumber, 'lat', -90, 90),
      lng: parseCoordinate(values.lng, rowNumber, 'lng', -180, 180),
      address: optionalText(values.address),
    };

    const storeKey = [
      record.brand_source ?? '',
      record.brand_external_id,
      record.source,
      record.external_id,
    ].join('\u001f');
    if (seenStoreKeys.has(storeKey)) {
      throw new Error(
        `Duplicate store key at row ${rowNumber}: brand_external_id=${record.brand_external_id}, source=${record.source}, external_id=${record.external_id}`
      );
    }
    seenStoreKeys.add(storeKey);
    records.push(record);
  }

  if (records.length === 0) {
    throw new Error('CSV must include at least one store row.');
  }

  return records;
}

export function getManualStoreBrandKeys(
  records: readonly ManualStoreCsvRecord[]
): ManualStoreBrandKey[] {
  const keys: ManualStoreBrandKey[] = [];
  const seen = new Set<string>();

  for (const record of records) {
    const key = {
      brand_source: record.brand_source,
      brand_external_id: record.brand_external_id,
    };
    const keyId = `${key.brand_source ?? ''}\u001f${key.brand_external_id}`;
    if (seen.has(keyId)) continue;
    seen.add(keyId);
    keys.push(key);
  }

  return keys;
}

export function brandKeyLabel(key: ManualStoreBrandKey): string {
  return key.brand_source
    ? `${key.brand_source}/${key.brand_external_id}`
    : key.brand_external_id;
}

export function buildManualStoreUpsertRows(
  records: readonly ManualStoreCsvRecord[],
  brandIdsByKey: ReadonlyMap<string, string>,
  fetchedAt: string
): StoreUpsertRow[] {
  return records.map((record) => {
    const brandKey = {
      brand_source: record.brand_source,
      brand_external_id: record.brand_external_id,
    };
    const brandId = brandIdsByKey.get(brandKeyId(brandKey));
    if (!brandId) {
      throw new Error(`Missing resolved brand id for ${brandKeyLabel(brandKey)}.`);
    }

    return {
      brand_id: brandId,
      source: record.source,
      external_id: record.external_id,
      name: record.name,
      lat: record.lat,
      lng: record.lng,
      address: record.address,
      updated_at: fetchedAt,
      last_seen_at: fetchedAt,
    };
  });
}

export function brandKeyId(key: ManualStoreBrandKey): string {
  return `${key.brand_source ?? ''}\u001f${key.brand_external_id}`;
}

function parseCsvRows(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    const next = csv[index + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        index += 1;
        continue;
      }
      if (char === '"') {
        inQuotes = false;
        continue;
      }
      field += char;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }
    if (char === ',') {
      row.push(field);
      field = '';
      continue;
    }
    if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      continue;
    }
    if (char === '\r') {
      continue;
    }
    field += char;
  }

  if (inQuotes) {
    throw new Error('CSV has an unterminated quoted field.');
  }

  row.push(field);
  if (row.length > 1 || row[0].trim().length > 0) {
    rows.push(row);
  }

  return rows;
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase();
}

function rowToObject(headers: readonly string[], row: readonly string[]): Record<string, string> {
  const values: Record<string, string> = {};
  headers.forEach((header, index) => {
    values[header] = row[index] ?? '';
  });
  return values;
}

function requiredText(value: string | undefined, rowNumber: number, column: string): string {
  const normalized = optionalText(value);
  if (normalized === null) {
    throw new Error(`Row ${rowNumber} is missing required ${column}.`);
  }
  return normalized;
}

function optionalText(value: string | undefined): string | null {
  if (value === undefined) return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function parseCoordinate(
  value: string | undefined,
  rowNumber: number,
  column: string,
  min: number,
  max: number
): number {
  const rawValue = requiredText(value, rowNumber, column);
  const coordinate = Number(rawValue);
  if (!Number.isFinite(coordinate) || coordinate < min || coordinate > max) {
    throw new Error(`Row ${rowNumber} has invalid ${column}: ${rawValue}`);
  }
  return coordinate;
}
