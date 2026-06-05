import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

import {
  extractUiNodeAttrs,
  findTransientUiDismissTarget,
  looksLikeTransientUi,
} from './adbUi.ts';
import { parseGenericCouponsFromXml } from './genericAdbCoupon.ts';
import type { CrawlAdapter, CrawlCouponInput } from '../types.ts';

const SOURCE = 'mcdonalds-kr-adb';
const PACKAGE_NAME = 'com.mcdonalds.mobileapp';
const REMOTE_XML_PATH = '/sdcard/coupon-map-mcdonalds-window.xml';
const DEFAULT_WAIT_MS = 1500;
const MAX_SECTION_SWIPES = 6;
const MAX_COUPON_SWIPES = 14;

const genericConfig = {
  source: SOURCE,
  ignoredTexts: ['맥도날드', 'McDonald’s', 'McDonalds', '홈', '주문', '마이페이지'],
  defaultOrderMethods: ['M오더'],
};

interface Point {
  x: number;
  y: number;
}

interface Bounds {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface DisplayNode {
  text: string;
  contentDesc: string;
  resourceId: string;
  bounds: Bounds;
  clickable: boolean;
}

export interface ParsedMcdonaldsCoupon {
  title: string;
  validUntil: string | null;
  originalPriceKrw: number | null;
  couponPriceKrw: number | null;
  discountPercent: number | null;
  sourceTexts: string[];
}

export const mcdonaldsKrAdbAdapter: CrawlAdapter = {
  source: SOURCE,
  async crawl() {
    const adbPath = resolveAdbPath();

    runAdb(adbPath, ['devices']);
    ensurePackageInstalled(adbPath);
    runAdb(adbPath, ['shell', 'am', 'force-stop', PACKAGE_NAME]);

    const launchOutput = runAdb(adbPath, ['shell', 'monkey', '-p', PACKAGE_NAME, '1']);
    if (!launchOutput.includes('Events injected')) {
      throw new Error(`Could not launch McDonald's app with monkey: ${launchOutput.trim()}`);
    }

    await wait(2500);
    await settleTransientUi(adbPath);
    await ensureCouponTab(adbPath);
    const firstCouponXml = await scrollToCouponSection(adbPath);
    const parsedCoupons = await collectCoupons(adbPath, firstCouponXml);

    if (parsedCoupons.length === 0) {
      throw new Error("McDonald's coupon crawl found no coupons in the UI XML.");
    }

    return {
      brand: {
        source: SOURCE,
        external_id: 'mcdonalds',
        name: '맥도날드',
        app_scheme: 'https://links.mcdonaldsapps.com/',
        store_url: 'https://www.mcdonalds.co.kr',
        app_store_url: 'https://play.google.com/store/apps/details?id=com.mcdonalds.mobileapp',
        iphone_store_url: 'https://apps.apple.com/kr/app/%EB%A7%A5%EB%8F%84%EB%82%A0%EB%93%9C/id1217507712',
      },
      stores: [],
      coupons: toCrawlCoupons(parsedCoupons),
    };
  },
};

export function parseMcdonaldsCouponsFromXml(xml: string): ParsedMcdonaldsCoupon[] {
  const dealCoupons = parseMcdonaldsDealCardsFromXml(xml);
  if (dealCoupons.length > 0) return dealCoupons;

  return uniqueCoupons([
    ...parseGenericCouponsFromXml(xml, genericConfig)
      .filter((coupon) => !isIgnoredGenericCouponTitle(coupon.title))
      .map((coupon) => ({
        title: coupon.title,
        validUntil: coupon.validUntil,
        originalPriceKrw: coupon.originalPriceKrw,
        couponPriceKrw: coupon.couponPriceKrw,
        discountPercent: coupon.discountPercent,
        sourceTexts: coupon.sourceTexts,
      })),
  ]);
}

async function ensureCouponTab(adbPath: string): Promise<void> {
  const size = getScreenSize(adbPath);

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const xml = dumpUiXml(adbPath);
    throwIfLoginRequired(xml);
    if (await dismissTransientUiIfPresent(adbPath, xml)) continue;
    if (isDealsScreen(xml)) return;

    const target =
      findResourceIdNodeCenter(xml, 'MainTabBar/1') ??
      findTextNodeCenter(xml, '쿠폰', { minY: Math.round(size.height * 0.75) }) ?? {
        x: Math.round(size.width * 0.3),
        y: Math.round(size.height * 0.91),
      };

    runAdb(adbPath, ['shell', 'input', 'tap', String(target.x), String(target.y)]);
    await wait(DEFAULT_WAIT_MS);
  }

  throw new Error("Could not navigate to the McDonald's coupon tab with ADB.");
}

async function scrollToCouponSection(adbPath: string): Promise<string> {
  const size = getScreenSize(adbPath);

  for (let attempt = 0; attempt <= MAX_SECTION_SWIPES; attempt += 1) {
    const xml = dumpUiXml(adbPath);
    throwIfLoginRequired(xml);
    if (await dismissTransientUiIfPresent(adbPath, xml)) continue;
    if (isCouponSection(xml)) return xml;
    if (attempt === MAX_SECTION_SWIPES) break;

    runAdb(adbPath, [
      'shell',
      'input',
      'swipe',
      String(Math.round(size.width * 0.5)),
      String(Math.round(size.height * 0.78)),
      String(Math.round(size.width * 0.5)),
      String(Math.round(size.height * 0.24)),
      '550',
    ]);
    await wait(DEFAULT_WAIT_MS);
  }

  throw new Error("Could not find the McDonald's coupon card section with ADB.");
}

async function collectCoupons(
  adbPath: string,
  firstXml: string
): Promise<ParsedMcdonaldsCoupon[]> {
  const size = getScreenSize(adbPath);
  const collected = new Map<string, ParsedMcdonaldsCoupon>();
  let idleAttempts = 0;

  for (let attempt = 0; attempt <= MAX_COUPON_SWIPES; attempt += 1) {
    const xml = attempt === 0 ? firstXml : dumpUiXml(adbPath);
    throwIfLoginRequired(xml);
    if (await dismissTransientUiIfPresent(adbPath, xml)) continue;

    const beforeCount = collected.size;
    for (const coupon of parseMcdonaldsCouponsFromXml(xml)) {
      mergeCoupon(collected, coupon);
    }

    idleAttempts = collected.size === beforeCount ? idleAttempts + 1 : 0;
    if (collected.size > 0 && idleAttempts >= 3) break;
    if (attempt === MAX_COUPON_SWIPES) break;

    runAdb(adbPath, [
      'shell',
      'input',
      'swipe',
      String(Math.round(size.width * 0.5)),
      String(Math.round(size.height * 0.78)),
      String(Math.round(size.width * 0.5)),
      String(Math.round(size.height * 0.28)),
      '550',
    ]);
    await wait(DEFAULT_WAIT_MS);
  }

  return [...collected.values()];
}

async function settleTransientUi(adbPath: string, maxAttempts = 4): Promise<void> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const xml = dumpUiXml(adbPath);
    throwIfLoginRequired(xml);
    if (!(await dismissTransientUiIfPresent(adbPath, xml))) return;
  }
}

async function dismissTransientUiIfPresent(adbPath: string, xml: string): Promise<boolean> {
  const target = findTransientUiDismissTarget(xml, {
    dismissTexts: ['닫기', '확인', '나중에', '오늘 하루 보지 않기', '오늘은 그만 보기'],
    transientHintPatterns: [/업데이트/, /프로모션/, /권한/, /알림/],
  });
  if (target) {
    runAdb(adbPath, [
      'shell',
      'input',
      'tap',
      String(target.point.x),
      String(target.point.y),
    ]);
    await wait(650);
    return true;
  }

  if (looksLikeTransientUi(xml)) {
    runAdb(adbPath, ['shell', 'input', 'keyevent', 'KEYCODE_BACK']);
    await wait(800);
    return true;
  }

  return false;
}

function parseMcdonaldsDealCardsFromXml(xml: string): ParsedMcdonaldsCoupon[] {
  const nodes = extractDisplayNodes(xml);
  const cards = nodes.filter((node) => node.resourceId === 'DealsScreen/DealCard/McCard ');
  const coupons: ParsedMcdonaldsCoupon[] = [];

  for (const card of cards) {
    const cardNodes = nodes.filter((node) => containsBounds(card.bounds, node.bounds));
    const titleNode = cardNodes.find(
      (node) =>
        node.resourceId === 'DealsScreen/DealCard/HeadlineBase ' &&
        normalizeText(node.contentDesc).length > 0
    );
    if (!titleNode) continue;

    const title = cleanCouponTitle(titleNode.contentDesc);
    if (!title) continue;

    const validNode = cardNodes.find((node) => parseValidUntil(node.text) !== null);
    const validUntil = validNode ? parseValidUntil(validNode.text) : null;
    if (validUntil === null) continue;

    const prices = parseKrwAmounts(title);
    coupons.push({
      title,
      validUntil,
      originalPriceKrw: prices.length >= 2 ? prices[0] : null,
      couponPriceKrw: prices.length > 0 ? prices[prices.length - 1] : null,
      discountPercent: parseDiscountPercent(title),
      sourceTexts: uniqueInOrder([title, validNode?.text ?? '']),
    });
  }

  return uniqueCoupons(coupons);
}

function isIgnoredGenericCouponTitle(title: string): boolean {
  return [
    '쿠폰',
    '사용 가능한 쿠폰',
    '신메뉴',
    '단품',
    '세트',
    '리워드',
    '모두보기',
  ].includes(title);
}

function toCrawlCoupons(coupons: ParsedMcdonaldsCoupon[]): CrawlCouponInput[] {
  return coupons.map((coupon) => ({
    external_id: createCouponExternalId(coupon),
    title: coupon.title,
    discount_type: resolveDiscountType(coupon),
    discount_value: resolveDiscountValue(coupon),
    valid_until: coupon.validUntil,
    is_active: true,
    raw_payload: {
      source: SOURCE,
      original_price_krw: coupon.originalPriceKrw,
      coupon_price_krw: coupon.couponPriceKrw,
      discount_percent: coupon.discountPercent,
      order_methods: ['M오더'],
      source_texts: coupon.sourceTexts,
    },
  }));
}

function extractDisplayNodes(xml: string): DisplayNode[] {
  return extractUiNodeAttrs(xml)
    .map((node) => {
      const bounds = parseBounds(node.bounds);
      if (!bounds) return null;
      return {
        text: normalizeText(node.text),
        contentDesc: normalizeText(node.contentDesc),
        resourceId: node.resourceId,
        bounds,
        clickable: node.clickable,
      };
    })
    .filter((node): node is DisplayNode => node !== null)
    .sort((a, b) => a.bounds.y1 - b.bounds.y1 || a.bounds.x1 - b.bounds.x1);
}

function isDealsScreen(xml: string): boolean {
  return extractDisplayNodes(xml).some((node) => node.resourceId.startsWith('DealsScreen/'));
}

function isCouponSection(xml: string): boolean {
  if (parseMcdonaldsDealCardsFromXml(xml).length > 0) return true;
  return extractDisplayNodes(xml).some(
    (node) =>
      node.resourceId === 'DealsScreen/SectionHeader/HeadlineBase ' &&
      node.contentDesc === '쿠폰'
  );
}

function mergeCoupon(
  collected: Map<string, ParsedMcdonaldsCoupon>,
  coupon: ParsedMcdonaldsCoupon
): void {
  const key = couponFingerprint(coupon);
  const existing = collected.get(key);
  if (!existing) {
    collected.set(key, coupon);
    return;
  }

  existing.sourceTexts = uniqueInOrder([...existing.sourceTexts, ...coupon.sourceTexts]);
  existing.originalPriceKrw ??= coupon.originalPriceKrw;
  existing.couponPriceKrw ??= coupon.couponPriceKrw;
  existing.discountPercent ??= coupon.discountPercent;
}

function resolveDiscountType(coupon: ParsedMcdonaldsCoupon): CrawlCouponInput['discount_type'] {
  if (coupon.discountPercent !== null) return '정률';
  if (coupon.originalPriceKrw !== null && coupon.couponPriceKrw !== null) return '정액';
  if (coupon.couponPriceKrw !== null) return '세트';
  return '정액';
}

function resolveDiscountValue(coupon: ParsedMcdonaldsCoupon): number {
  if (coupon.discountPercent !== null) return coupon.discountPercent;
  if (coupon.originalPriceKrw !== null && coupon.couponPriceKrw !== null) {
    return Math.max(0, coupon.originalPriceKrw - coupon.couponPriceKrw);
  }
  if (coupon.couponPriceKrw !== null) return coupon.couponPriceKrw;
  return 0;
}

function couponFingerprint(coupon: Pick<ParsedMcdonaldsCoupon, 'title' | 'validUntil'>): string {
  return `${coupon.title}|${coupon.validUntil ?? ''}`;
}

function uniqueCoupons(coupons: readonly ParsedMcdonaldsCoupon[]): ParsedMcdonaldsCoupon[] {
  const seen = new Set<string>();
  const result: ParsedMcdonaldsCoupon[] = [];

  for (const coupon of coupons) {
    const key = couponFingerprint(coupon);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(coupon);
  }

  return result;
}

function createCouponExternalId(coupon: ParsedMcdonaldsCoupon): string {
  const hash = createHash('sha256')
    .update(couponFingerprint(coupon), 'utf8')
    .digest('hex')
    .slice(0, 16);
  return `${SOURCE}-${hash}`;
}

function cleanCouponTitle(title: string): string {
  return normalizeText(title).replace(/\s+([,.)])/g, '$1');
}

function parseValidUntil(text: string): string | null {
  const dates = parseDateOnlyTexts(text);
  return dates[dates.length - 1] ?? null;
}

function parseDateOnlyTexts(text: string): string[] {
  const numericDates = [...text.matchAll(/(\d{4})\s*[./-]\s*(\d{1,2})\s*[./-]\s*(\d{1,2})/g)].map(
    (match) =>
      `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`
  );
  const koreanDates = [...text.matchAll(/(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/g)].map(
    (match) =>
      `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`
  );
  return [...numericDates, ...koreanDates];
}

function parseKrwAmounts(text: string): number[] {
  return [...text.matchAll(/(\d{1,3}(?:,\d{3})+|\d+)\s*원/g)].map((match) =>
    Number(match[1].replaceAll(',', ''))
  );
}

function parseDiscountPercent(text: string): number | null {
  const match = text.match(/-?\s*(\d+)\s*%/);
  return match ? Number(match[1]) : null;
}

function findTextNodeCenter(
  xml: string,
  text: string,
  options: { minY?: number } = {}
): Point | null {
  for (const node of extractDisplayNodes(xml)) {
    if (node.text !== text && node.contentDesc !== text) continue;
    if (options.minY !== undefined && node.bounds.y1 < options.minY) continue;
    return center(node.bounds);
  }
  return null;
}

function findResourceIdNodeCenter(xml: string, resourceId: string): Point | null {
  for (const node of extractDisplayNodes(xml)) {
    if (node.resourceId !== resourceId) continue;
    return center(node.bounds);
  }
  return null;
}

function containsBounds(outer: Bounds, inner: Bounds): boolean {
  return (
    inner.x1 >= outer.x1 &&
    inner.x2 <= outer.x2 &&
    inner.y1 >= outer.y1 &&
    inner.y2 <= outer.y2
  );
}

function parseBounds(bounds: string): Bounds | null {
  const match = bounds.match(/\[(\d+),(\d+)]\[(\d+),(\d+)]/);
  if (!match) return null;
  return {
    x1: Number(match[1]),
    y1: Number(match[2]),
    x2: Number(match[3]),
    y2: Number(match[4]),
  };
}

function center(bounds: Bounds): Point {
  return {
    x: Math.round((bounds.x1 + bounds.x2) / 2),
    y: Math.round((bounds.y1 + bounds.y2) / 2),
  };
}

function resolveAdbPath(): string {
  const candidates = [
    process.env.ADB_PATH,
    process.env.ANDROID_HOME ? `${process.env.ANDROID_HOME}/platform-tools/adb` : null,
    process.env.ANDROID_SDK_ROOT ? `${process.env.ANDROID_SDK_ROOT}/platform-tools/adb` : null,
    '/Users/wonjae/Library/Android/sdk/platform-tools/adb',
    'adb',
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    const result = spawnSync(candidate, ['version'], {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
    });
    if (result.status === 0) return candidate;
  }

  throw new Error('ADB was not found. Set ADB_PATH or ANDROID_HOME/ANDROID_SDK_ROOT.');
}

function ensurePackageInstalled(adbPath: string): void {
  const output = runAdb(adbPath, ['shell', 'pm', 'path', PACKAGE_NAME]);
  if (!output.includes('package:')) {
    throw new Error(`McDonald's app is not installed on the selected device: ${PACKAGE_NAME}`);
  }
}

function dumpUiXml(adbPath: string): string {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      runAdb(adbPath, ['shell', 'uiautomator', 'dump', REMOTE_XML_PATH]);
      return runAdb(adbPath, ['exec-out', 'cat', REMOTE_XML_PATH], 32 * 1024 * 1024);
    } catch (error: unknown) {
      lastError = error;
      sleepSync(500);
    }
  }

  throw lastError;
}

function runAdb(adbPath: string, args: string[], maxBuffer = 4 * 1024 * 1024): string {
  const effectiveArgs = withAdbSerial(args);
  const result = spawnSync(adbPath, effectiveArgs, {
    encoding: 'utf8',
    maxBuffer,
  });
  if (result.status !== 0) {
    const stderr = result.stderr.trim();
    const stdout = result.stdout.trim();
    if (isSuccessfulUiAutomatorDump(effectiveArgs, stdout, stderr)) {
      return result.stdout;
    }
    throw new Error(`adb ${effectiveArgs.join(' ')} failed: ${stderr || stdout || 'unknown error'}`);
  }
  return result.stdout;
}

function withAdbSerial(args: string[]): string[] {
  if (args[0] === 'devices') return args;
  const serial = process.env.ADB_SERIAL ?? process.env.ANDROID_SERIAL;
  return serial ? ['-s', serial, ...args] : args;
}

function isSuccessfulUiAutomatorDump(
  args: readonly string[],
  stdout: string,
  stderr: string
): boolean {
  if (!args.includes('uiautomator') || !args.includes('dump')) return false;
  return /UI hier(?:archy|chary) dumped to:/i.test(`${stdout}\n${stderr}`);
}

function getScreenSize(adbPath: string): { width: number; height: number } {
  const output = runAdb(adbPath, ['shell', 'wm', 'size']);
  const match = output.match(/Physical size:\s*(\d+)x(\d+)/);
  if (!match) return { width: 1080, height: 2340 };
  return { width: Number(match[1]), height: Number(match[2]) };
}

function throwIfLoginRequired(xml: string): void {
  const loginHint = extractDisplayNodes(xml)
    .flatMap((node) => [node.text, node.contentDesc])
    .find((value) => /로그인|카카오|휴대폰\s*번호/.test(value));
  if (loginHint) {
    throw new Error(`McDonald's coupon crawl requires an authenticated app session (${loginHint}).`);
  }
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function uniqueInOrder(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}
