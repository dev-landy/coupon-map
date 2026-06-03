const KOREA_TIME_ZONE = 'Asia/Seoul';
const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

const koreaDateFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: KOREA_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function getKoreaDateOnly(date: Date): string {
  const parts = koreaDateFormatter.formatToParts(date);
  const year = readPart(parts, 'year');
  const month = readPart(parts, 'month');
  const day = readPart(parts, 'day');
  return `${year}-${month}-${day}`;
}

export function isValidDateOnly(value: string): boolean {
  return parseDateOnlyParts(value) !== null;
}

export function diffDateOnlyDays(from: string, to: string): number | null {
  const fromParts = parseDateOnlyParts(from);
  const toParts = parseDateOnlyParts(to);
  if (fromParts === null || toParts === null) return null;

  const fromTime = Date.UTC(fromParts.year, fromParts.month - 1, fromParts.day);
  const toTime = Date.UTC(toParts.year, toParts.month - 1, toParts.day);
  return Math.round((toTime - fromTime) / MS_PER_DAY);
}

function readPart(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  const value = parts.find((part) => part.type === type)?.value;
  if (!value) throw new Error(`Could not format ${type} for ${KOREA_TIME_ZONE}`);
  return value;
}

function parseDateOnlyParts(value: string): { year: number; month: number; day: number } | null {
  const match = DATE_ONLY_PATTERN.exec(value.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}
