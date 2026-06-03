import { spawnSync } from 'node:child_process';

import {
  findTransientUiDismissTarget,
  looksLikeTransientUi,
  type TransientUiOptions,
} from './adbUi.ts';
import type { CrawlAdapter, CrawlCouponInput } from '../types.ts';

const REMOTE_XML_PATH = '/sdcard/coupon-map-window.xml';
const DEFAULT_WAIT_MS = 1500;
const MAX_SWIPES = 10;

const DEFAULT_IGNORED_TEXTS = [
  '쿠폰',
  'MY쿠폰',
  'MY 쿠폰',
  '전체',
  '사용하기',
  '자세히 보기',
  '닫기',
  '쿠폰 모두 받기',
  '쿠폰입력',
  '홈',
  '마이',
  '마이페이지',
  '멤버십/카드',
];

const DEFAULT_ORDER_METHOD_TEXTS = [
  '매장 방문',
  '매장주문',
  '방문주문',
  '매장',
  '딜리버리',
  '배달',
  '징거벨 오더',
  '징거벨오더',
  'M오더',
  '맥오더',
  '맥딜리버리',
  '포장',
  '픽업',
  '드라이브스루',
  '드라이브쓰루',
];

const PRODUCT_PRICE_LABELS = [
  /제품\s*금액/,
  /상품\s*금액/,
  /정상\s*금액/,
  /정상가/,
  /제품가/,
  /판매가/,
  /원가/,
];
const DISCOUNT_AMOUNT_LABELS = [/할인\s*금액/, /할인액/, /쿠폰\s*할인/];
const PAYMENT_AMOUNT_LABELS = [
  /결제\s*금액/,
  /결제액/,
  /쿠폰\s*가격/,
  /쿠폰가/,
  /구매\s*금액/,
  /최종\s*결제/,
  /판매\s*금액/,
];
const DETAIL_HINTS = [
  /쿠폰\s*정보/,
  /유효\s*기간/,
  /사용\s*기간/,
  /주문\s*방법/,
  /제품\s*금액/,
  /할인\s*금액/,
  /결제\s*금액/,
  /앱\s*링크/,
];

interface UiNodeAttrs {
  text: string;
  contentDesc: string;
  className: string;
  bounds: string;
  clickable: boolean;
  selected: boolean;
  checked: boolean;
}

interface Point {
  x: number;
  y: number;
}

export interface GenericAdbCouponConfig {
  source: string;
  packageName: string;
  brand: {
    external_id: string;
    name: string;
    app_scheme: string | null;
    store_url: string;
    app_store_url: string | null;
  };
  couponButtonTexts: string[];
  couponScreenTexts?: string[];
  ignoredTexts?: string[];
  loginRequiredTexts?: string[];
  orderMethodTexts?: string[];
  defaultOrderMethods?: string[];
  maxSwipes?: number;
  transientUiDismissTexts?: string[];
  transientUiHintPatterns?: RegExp[];
}

export interface ParsedGenericCouponDetail {
  title: string | null;
  couponKind: string | null;
  isWeeklyCoupon: boolean;
  validFrom: string | null;
  validUntil: string | null;
  validPeriodText: string | null;
  orderMethods: string[];
  productPriceKrw: number | null;
  discountAmountKrw: number | null;
  paymentAmountKrw: number | null;
  appLink: string | null;
  sourceTexts: string[];
}

export interface ParsedGenericCoupon {
  title: string;
  validUntil: string | null;
  originalPriceKrw: number | null;
  couponPriceKrw: number | null;
  discountPercent: number | null;
  detail: ParsedGenericCouponDetail | null;
  sourceTexts: string[];
}

export function createGenericAdbCouponAdapter(
  config: GenericAdbCouponConfig
): CrawlAdapter {
  return {
    source: config.source,
    async crawl() {
      const adbPath = resolveAdbPath();
      runAdb(adbPath, ['devices']);
      ensurePackageInstalled(adbPath, config.packageName);

      const launchOutput = runAdb(adbPath, [
        'shell',
        'monkey',
        '-p',
        config.packageName,
        '1',
      ]);
      if (!launchOutput.includes('Events injected')) {
        throw new Error(`Could not launch ${config.source}: ${launchOutput.trim()}`);
      }
      await wait(2500);
      await settleTransientUi(adbPath, config);

      await ensureCouponScreen(adbPath, config);
      await scrollToTop(adbPath);

      const coupons = await collectCoupons(adbPath, config);
      if (coupons.length === 0) {
        throw new Error(`${config.source} crawl found no coupons in the UI XML.`);
      }

      return {
        brand: {
          source: config.source,
          ...config.brand,
        },
        stores: [],
        coupons: toCrawlCoupons(config.source, coupons),
      };
    },
  };
}

export function parseGenericCouponsFromXml(
  xml: string,
  config: Pick<
    GenericAdbCouponConfig,
    'source' | 'ignoredTexts' | 'orderMethodTexts' | 'defaultOrderMethods'
  >
): ParsedGenericCoupon[] {
  const ignoredTexts = createIgnoredTexts(config.ignoredTexts);
  const activeOrderMethods = findActiveOrderMethods(
    xml,
    config.orderMethodTexts ?? DEFAULT_ORDER_METHOD_TEXTS
  );
  const defaultOrderMethods =
    activeOrderMethods.length > 0 ? activeOrderMethods : config.defaultOrderMethods ?? [];
  const texts = extractTexts(xml)
    .map((text) => normalizeText(text))
    .filter((text) => text.length > 0)
    .filter((text) => !ignoredTexts.has(text));

  const coupons: ParsedGenericCoupon[] = [];
  for (let index = 0; index < texts.length; index += 1) {
    const validUntil = parseDateText(texts[index]);
    if (validUntil === null) continue;

    const titleCandidate = findNearestTitle(texts, index, ignoredTexts);
    if (!titleCandidate) continue;

    const title = cleanCouponTitle(titleCandidate.text);
    if (!title) continue;

    const windowTexts = buildCouponTextWindow(texts, titleCandidate.index, index, ignoredTexts);
    const prices = uniqueNumbers(windowTexts.flatMap(parseKrwAmounts));
    const discountPercent = parseDiscountPercent(windowTexts);

    const coupon: ParsedGenericCoupon = {
      title,
      validUntil,
      originalPriceKrw: prices.length >= 2 ? prices[0] : null,
      couponPriceKrw: prices.length > 0 ? prices[prices.length - 1] : null,
      discountPercent,
      detail: null,
      sourceTexts: windowTexts,
    };
    coupon.detail = buildListCouponDetail(windowTexts, coupon, defaultOrderMethods);
    coupons.push(coupon);
  }

  return uniqueCoupons(coupons);
}

export function parseGenericCouponDetailFromXml(
  xml: string,
  fallbackCoupon: ParsedGenericCoupon | null = null
): ParsedGenericCouponDetail | null {
  return parseGenericCouponDetailFromTexts(
    uniqueInOrder(extractTexts(xml).map(normalizeText).filter(Boolean)),
    fallbackCoupon
  );
}

export function parseGenericCouponDetailFromTexts(
  texts: string[],
  fallbackCoupon: ParsedGenericCoupon | null = null
): ParsedGenericCouponDetail | null {
  const normalizedTexts = uniqueInOrder(texts.map(normalizeText).filter(Boolean));
  if (normalizedTexts.length === 0) return null;
  if (!fallbackCoupon && !isCouponDetailTextSet(normalizedTexts)) return null;

  const validPeriod = parseValidPeriod(normalizedTexts);
  const productPriceKrw =
    parseLabeledKrw(normalizedTexts, PRODUCT_PRICE_LABELS) ??
    fallbackCoupon?.originalPriceKrw ??
    null;
  const paymentAmountKrw =
    parseLabeledKrw(normalizedTexts, PAYMENT_AMOUNT_LABELS) ??
    fallbackCoupon?.couponPriceKrw ??
    null;
  const discountAmountKrw =
    parseLabeledKrw(normalizedTexts, DISCOUNT_AMOUNT_LABELS, true) ??
    deriveDiscountAmount(productPriceKrw, paymentAmountKrw);
  const couponKind = parseCouponKind(normalizedTexts) ?? parseCouponKindFromTitle(fallbackCoupon?.title);
  const isWeeklyCoupon =
    couponKind === '위클리' ||
    normalizedTexts.some((text) => normalizeKorean(text).includes('위클리')) ||
    Boolean(fallbackCoupon && normalizeKorean(fallbackCoupon.title).includes('위클리'));

  return {
    title: parseDetailTitle(normalizedTexts) ?? fallbackCoupon?.title ?? null,
    couponKind,
    isWeeklyCoupon,
    validFrom: validPeriod.validFrom,
    validUntil: validPeriod.validUntil ?? fallbackCoupon?.validUntil ?? null,
    validPeriodText: validPeriod.validPeriodText,
    orderMethods: parseOrderMethods(normalizedTexts),
    productPriceKrw,
    discountAmountKrw,
    paymentAmountKrw,
    appLink: parseAppLink(normalizedTexts),
    sourceTexts: normalizedTexts,
  };
}

async function ensureCouponScreen(
  adbPath: string,
  config: GenericAdbCouponConfig
): Promise<void> {
  const size = getScreenSize(adbPath);

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const xml = dumpUiXml(adbPath);
    throwIfLoginRequired(xml, config);
    if (await dismissTransientUiIfPresent(adbPath, xml, config)) continue;
    if (isCouponScreen(xml, config)) return;

    const target = findFirstTextNodeCenter(xml, config.couponButtonTexts) ?? {
      x: Math.round(size.width * 0.35),
      y: Math.round(size.height * 0.92),
    };
    runAdb(adbPath, ['shell', 'input', 'tap', String(target.x), String(target.y)]);
    await wait(DEFAULT_WAIT_MS);
  }

  throw new Error(`Could not navigate to the ${config.source} coupon screen with ADB.`);
}

async function collectCoupons(
  adbPath: string,
  config: GenericAdbCouponConfig
): Promise<ParsedGenericCoupon[]> {
  const collected = new Map<string, ParsedGenericCoupon>();

  await collectCurrentCouponList(adbPath, config, collected);

  const tabLabels = config.orderMethodTexts ?? [];
  if (tabLabels.length > 0) {
    await scrollToTop(adbPath);
    const tabTargets = findOrderMethodTabTargets(dumpUiXml(adbPath), tabLabels);

    for (const tab of tabTargets) {
      if (tab.active) continue;
      runAdb(adbPath, ['shell', 'input', 'tap', String(tab.point.x), String(tab.point.y)]);
      await wait(DEFAULT_WAIT_MS);
      await settleTransientUi(adbPath, config, 2);
      await scrollToTop(adbPath);
      await collectCurrentCouponList(adbPath, config, collected);
    }
  }

  return [...collected.values()];
}

async function collectCurrentCouponList(
  adbPath: string,
  config: GenericAdbCouponConfig,
  collected: Map<string, ParsedGenericCoupon>
): Promise<void> {
  const size = getScreenSize(adbPath);
  const maxSwipes = config.maxSwipes ?? MAX_SWIPES;
  let idleAttempts = 0;

  for (let attempt = 0; attempt <= maxSwipes; attempt += 1) {
    const xml = dumpUiXml(adbPath);
    throwIfLoginRequired(xml, config);
    if (await dismissTransientUiIfPresent(adbPath, xml, config)) continue;
    const beforeCount = collected.size;

    for (const coupon of parseGenericCouponsFromXml(xml, config)) {
      mergeCollectedCoupon(collected, coupon);
    }

    idleAttempts = collected.size === beforeCount ? idleAttempts + 1 : 0;
    if (attempt === maxSwipes || (collected.size > 0 && idleAttempts >= 2)) break;

    runAdb(adbPath, [
      'shell',
      'input',
      'swipe',
      String(Math.round(size.width * 0.5)),
      String(Math.round(size.height * 0.8)),
      String(Math.round(size.width * 0.5)),
      String(Math.round(size.height * 0.28)),
      '550',
    ]);
    await wait(DEFAULT_WAIT_MS);
  }

}

async function settleTransientUi(
  adbPath: string,
  config: GenericAdbCouponConfig,
  maxAttempts = 3
): Promise<void> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const xml = dumpUiXml(adbPath);
    throwIfLoginRequired(xml, config);
    if (!(await dismissTransientUiIfPresent(adbPath, xml, config))) return;
  }
}

async function dismissTransientUiIfPresent(
  adbPath: string,
  xml: string,
  config: GenericAdbCouponConfig
): Promise<boolean> {
  const options = transientUiOptions(config);
  const target = findTransientUiDismissTarget(xml, options);
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

  if (looksLikeTransientUi(xml, options)) {
    runAdb(adbPath, ['shell', 'input', 'keyevent', 'KEYCODE_BACK']);
    await wait(800);
    return true;
  }

  return false;
}

function transientUiOptions(config: GenericAdbCouponConfig): TransientUiOptions {
  return {
    dismissTexts: config.transientUiDismissTexts,
    transientHintPatterns: config.transientUiHintPatterns,
  };
}

async function scrollToTop(adbPath: string): Promise<void> {
  const size = getScreenSize(adbPath);

  for (let attempt = 0; attempt < 4; attempt += 1) {
    runAdb(adbPath, [
      'shell',
      'input',
      'swipe',
      String(Math.round(size.width * 0.5)),
      String(Math.round(size.height * 0.28)),
      String(Math.round(size.width * 0.5)),
      String(Math.round(size.height * 0.82)),
      '450',
    ]);
    await wait(350);
  }
}

function isCouponScreen(xml: string, config: GenericAdbCouponConfig): boolean {
  if (parseGenericCouponsFromXml(xml, config).length > 0) return true;
  return (config.couponScreenTexts ?? []).some((text) => xml.includes(`text="${escapeXml(text)}"`));
}

function throwIfLoginRequired(xml: string, config: GenericAdbCouponConfig): void {
  const texts = extractTexts(xml);
  const hints = config.loginRequiredTexts ?? [];
  const matchedHint = hints.find((hint) => texts.some((text) => text.includes(hint)) || xml.includes(hint));
  if (matchedHint) {
    throw new Error(`${config.source} coupon crawl requires an authenticated app session (${matchedHint}).`);
  }
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

function ensurePackageInstalled(adbPath: string, packageName: string): void {
  const output = runAdb(adbPath, ['shell', 'pm', 'path', packageName]);
  if (!output.includes('package:')) {
    throw new Error(`App is not installed on the selected emulator: ${packageName}`);
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

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function getScreenSize(adbPath: string): { width: number; height: number } {
  const output = runAdb(adbPath, ['shell', 'wm', 'size']);
  const match = output.match(/Physical size:\s*(\d+)x(\d+)/);
  if (!match) return { width: 1080, height: 2424 };
  return { width: Number(match[1]), height: Number(match[2]) };
}

function extractTexts(xml: string): string[] {
  return extractNodeAttrs(xml)
    .map((node) => node.text)
    .filter((text) => text.trim().length > 0);
}

function extractNodeAttrs(xml: string): UiNodeAttrs[] {
  const nodes: UiNodeAttrs[] = [];
  for (const match of xml.matchAll(/<node\b([^>]*)/g)) {
    const attrs = parseAttributes(match[1] ?? '');
    nodes.push({
      text: decodeXml(attrs.text ?? ''),
      contentDesc: decodeXml(attrs['content-desc'] ?? ''),
      className: decodeXml(attrs.class ?? ''),
      bounds: decodeXml(attrs.bounds ?? ''),
      clickable: attrs.clickable === 'true',
      selected: attrs.selected === 'true',
      checked: attrs.checked === 'true',
    });
  }
  return nodes;
}

function parseAttributes(input: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrPattern = /([\w:-]+)="([^"]*)"/g;
  for (const match of input.matchAll(attrPattern)) {
    attrs[match[1]] = match[2];
  }
  return attrs;
}

function decodeXml(value: string): string {
  return value
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&');
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function createIgnoredTexts(ignoredTexts: readonly string[] | undefined): Set<string> {
  return new Set([...DEFAULT_IGNORED_TEXTS, ...(ignoredTexts ?? [])]);
}

function parseDateText(text: string): string | null {
  return parseDateOnlyTexts(text)[0] ?? null;
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

function findNearestTitle(
  texts: readonly string[],
  dateIndex: number,
  ignoredTexts: ReadonlySet<string>
): { text: string; index: number } | null {
  for (let index = dateIndex - 1; index >= Math.max(0, dateIndex - 10); index -= 1) {
    const text = texts[index];
    if (isCouponTitle(text, ignoredTexts)) return { text, index };
  }
  return null;
}

function buildCouponTextWindow(
  texts: readonly string[],
  titleIndex: number,
  dateIndex: number,
  ignoredTexts: ReadonlySet<string>
): string[] {
  const windowTexts = texts.slice(titleIndex, dateIndex + 1);

  for (let index = dateIndex + 1; index < Math.min(texts.length, dateIndex + 8); index += 1) {
    const text = texts[index];
    if (ignoredTexts.has(text) || /^\d+$/.test(text)) break;
    if (parseDateText(text) !== null) break;
    if (isCouponTitle(text, ignoredTexts) && hasNearbyDate(texts, index)) break;
    windowTexts.push(text);
  }

  return uniqueInOrder(windowTexts);
}

function hasNearbyDate(texts: readonly string[], startIndex: number): boolean {
  for (let index = startIndex + 1; index < Math.min(texts.length, startIndex + 4); index += 1) {
    if (parseDateText(texts[index]) !== null) return true;
  }
  return false;
}

function isCouponTitle(text: string, ignoredTexts: ReadonlySet<string>): boolean {
  if (ignoredTexts.has(text)) return false;
  if (/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(text)) return false;
  if (/^\d{4}\s*[./-]\s*\d{1,2}\s*[./-]\s*\d{1,2}/.test(text)) return false;
  if (isPriceText(text)) return false;
  if (/^\d+%\s*할인$/.test(text)) return false;
  if (/^\d+$/.test(text)) return false;
  if (text.length < 2) return false;
  return hasHangul(text) || parseKrwAmounts(text).length > 0;
}

function cleanCouponTitle(text: string): string {
  const withoutPrices = text
    .replace(/(?:₩\s*)?\d{1,3}(?:,\d{3})*\s*원/g, '')
    .replace(/[→>~\-–—]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return withoutPrices || text.trim();
}

function isPriceText(text: string): boolean {
  return /^(?:[-–—]\s*)?(?:₩\s*)?\d{1,3}(?:,\d{3})*\s*원?$/.test(text);
}

function parseKrw(text: string): number {
  const sign = /^-\s*/.test(text.trim()) ? -1 : 1;
  return sign * Number(text.replace(/[^\d]/g, ''));
}

function parseKrwAmounts(text: string): number[] {
  return [...text.matchAll(/-?\s*(?:₩\s*)?\d{1,3}(?:,\d{3})*\s*원/g)].map((match) =>
    parseKrw(match[0])
  );
}

function parseDiscountPercent(texts: readonly string[]): number | null {
  for (const text of texts) {
    const match = text.match(/(\d+)\s*%\s*할인/);
    if (match) return Number(match[1]);
  }
  return null;
}

function buildListCouponDetail(
  texts: string[],
  coupon: ParsedGenericCoupon,
  defaultOrderMethods: string[]
): ParsedGenericCouponDetail {
  const detail =
    parseGenericCouponDetailFromTexts(texts, coupon) ??
    ({
      title: coupon.title,
      couponKind: parseCouponKindFromTitle(coupon.title),
      isWeeklyCoupon: normalizeKorean(coupon.title).includes('위클리'),
      validFrom: null,
      validUntil: coupon.validUntil,
      validPeriodText: texts.find((text) => parseDateText(text) !== null) ?? null,
      orderMethods: [],
      productPriceKrw: coupon.originalPriceKrw,
      discountAmountKrw: deriveDiscountAmount(coupon.originalPriceKrw, coupon.couponPriceKrw),
      paymentAmountKrw: coupon.couponPriceKrw,
      appLink: parseAppLink(texts),
      sourceTexts: texts,
    } satisfies ParsedGenericCouponDetail);

  const parsedMethods = detail.orderMethods.length > 0 ? detail.orderMethods : parseOrderMethods(texts);
  return {
    ...detail,
    orderMethods: defaultOrderMethods.length > 0 ? defaultOrderMethods : parsedMethods,
    productPriceKrw: detail.productPriceKrw ?? coupon.originalPriceKrw,
    discountAmountKrw:
      detail.discountAmountKrw ??
      deriveDiscountAmount(detail.productPriceKrw ?? coupon.originalPriceKrw, detail.paymentAmountKrw ?? coupon.couponPriceKrw),
    paymentAmountKrw: detail.paymentAmountKrw ?? coupon.couponPriceKrw,
  };
}

function isCouponDetailTextSet(texts: string[]): boolean {
  if (texts.some((text) => DETAIL_HINTS.some((hint) => hint.test(text)))) return true;
  return texts.some((text) => parseAppLink([text]) !== null);
}

function parseValidPeriod(texts: string[]): {
  validFrom: string | null;
  validUntil: string | null;
  validPeriodText: string | null;
} {
  const labelIndex = texts.findIndex((text) => /유효|사용\s*기간|기간|만료|까지/.test(text));
  const candidates =
    labelIndex >= 0 ? texts.slice(labelIndex, Math.min(texts.length, labelIndex + 4)) : texts;

  for (const text of candidates) {
    const dates = parseDateOnlyTexts(text);
    if (dates.length >= 2) {
      return { validFrom: dates[0], validUntil: dates[dates.length - 1], validPeriodText: text };
    }
    if (dates.length === 1) {
      return { validFrom: null, validUntil: dates[0], validPeriodText: text };
    }
  }

  return { validFrom: null, validUntil: null, validPeriodText: null };
}

function parseLabeledKrw(
  texts: string[],
  labelPatterns: RegExp[],
  absoluteValue = false
): number | null {
  for (let index = 0; index < texts.length; index += 1) {
    const text = texts[index];
    if (!labelPatterns.some((pattern) => pattern.test(text))) continue;

    const sameTextPrices = parseKrwAmounts(text);
    const value =
      sameTextPrices.length > 0
        ? sameTextPrices[sameTextPrices.length - 1]
        : findNextKrw(texts, index + 1);

    if (value !== null) return absoluteValue ? Math.abs(value) : value;
  }

  return null;
}

function findNextKrw(texts: string[], startIndex: number): number | null {
  for (let index = startIndex; index < Math.min(texts.length, startIndex + 4); index += 1) {
    const prices = parseKrwAmounts(texts[index]);
    if (prices.length > 0) return prices[0];
  }
  return null;
}

function deriveDiscountAmount(
  productPriceKrw: number | null,
  paymentAmountKrw: number | null
): number | null {
  if (productPriceKrw === null || paymentAmountKrw === null) return null;
  return Math.max(0, productPriceKrw - paymentAmountKrw);
}

function parseCouponKind(texts: string[]): string | null {
  for (const text of texts) {
    const kind = parseCouponKindFromTitle(text);
    if (kind) return kind;
  }
  return null;
}

function parseCouponKindFromTitle(title: string | null | undefined): string | null {
  if (!title) return null;
  if (normalizeKorean(title).includes('위클리')) return '위클리';
  if (normalizeKorean(title).includes('먼슬리')) return '먼슬리';
  const bracket = title.match(/^\[([^\]]+)\]/);
  return bracket?.[1]?.trim() || null;
}

function parseDetailTitle(texts: string[]): string | null {
  const couponInfoIndex = texts.findIndex((text) => /쿠폰\s*정보/.test(text));
  const candidates = couponInfoIndex >= 0 ? texts.slice(0, couponInfoIndex) : texts;

  for (const text of candidates.slice().reverse()) {
    if (!isCouponTitle(text, new Set(DEFAULT_IGNORED_TEXTS))) continue;
    return cleanCouponTitle(text);
  }

  return null;
}

function parseOrderMethods(texts: string[]): string[] {
  const methods = new Set<string>();

  for (const text of texts) {
    const normalized = normalizeKorean(text);
    if (normalized.includes('징거벨오더')) methods.add('징거벨 오더');
    if (normalized.includes('M오더') || normalized.includes('맥오더')) methods.add('M오더');
    if (normalized.includes('맥딜리버리')) methods.add('맥딜리버리');
    if (normalized.includes('딜리버리')) methods.add('딜리버리');
    if (normalized.includes('배달')) methods.add('배달');
    if (normalized.includes('매장방문')) methods.add('매장 방문');
    if (normalized.includes('매장주문')) methods.add('매장주문');
    if (normalized.includes('방문주문')) methods.add('방문주문');
    if (normalized.includes('포장')) methods.add('포장');
    if (normalized.includes('픽업')) methods.add('픽업');
    if (normalized.includes('드라이브스루') || normalized.includes('드라이브쓰루')) {
      methods.add('드라이브스루');
    }
  }

  return [...methods];
}

function parseAppLink(texts: string[]): string | null {
  for (const text of texts) {
    const match = text.match(/\b[a-z][a-z0-9+.-]*:\/\/[^\s"'<>]+/i);
    if (match) return match[0];
  }
  return null;
}

function findActiveOrderMethods(xml: string, labels: readonly string[]): string[] {
  const labelSet = new Set(labels);
  const methods = new Set<string>();

  for (const node of extractNodeAttrs(xml)) {
    const contentDesc = normalizeText(node.contentDesc);
    if (contentDesc && labelSet.has(contentDesc) && (node.selected || node.checked || !node.clickable)) {
      methods.add(contentDesc);
      continue;
    }

    const text = normalizeText(node.text);
    if (text && labelSet.has(text) && (node.selected || node.checked)) {
      methods.add(text);
    }
  }

  return [...methods];
}

function findOrderMethodTabTargets(
  xml: string,
  labels: readonly string[]
): { label: string; active: boolean; point: Point }[] {
  const labelSet = new Set(labels);
  const tabs: { label: string; active: boolean; point: Point }[] = [];

  for (const node of extractNodeAttrs(xml)) {
    const label = normalizeText(node.contentDesc);
    const bounds = parseBounds(node.bounds);
    if (!label || !labelSet.has(label) || !bounds) continue;

    tabs.push({
      label,
      active: node.selected || node.checked || !node.clickable,
      point: {
        x: Math.round((bounds.x1 + bounds.x2) / 2),
        y: Math.round((bounds.y1 + bounds.y2) / 2),
      },
    });
  }

  const seen = new Set<string>();
  return tabs.filter((tab) => {
    if (seen.has(tab.label)) return false;
    seen.add(tab.label);
    return true;
  });
}

function findFirstTextNodeCenter(xml: string, labels: readonly string[]): Point | null {
  const labelSet = new Set(labels);
  const candidates = extractNodeAttrs(xml)
    .filter((node) => labelSet.has(normalizeText(node.text)) || labelSet.has(normalizeText(node.contentDesc)))
    .map((node) => ({ node, bounds: parseBounds(node.bounds) }))
    .filter((candidate): candidate is { node: UiNodeAttrs; bounds: NonNullable<ReturnType<typeof parseBounds>> } => candidate.bounds !== null);

  const candidate =
    candidates.find(({ node, bounds }) => node.clickable && bounds.y1 > 1500) ??
    candidates.find(({ bounds }) => bounds.y1 > 1500) ??
    candidates.find(({ node }) => node.clickable) ??
    candidates[0];

  if (!candidate) return null;
  return {
    x: Math.round((candidate.bounds.x1 + candidate.bounds.x2) / 2),
    y: Math.round((candidate.bounds.y1 + candidate.bounds.y2) / 2),
  };
}

function parseBounds(
  bounds: string
): { x1: number; y1: number; x2: number; y2: number } | null {
  const match = bounds.match(/^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/);
  if (!match) return null;
  return {
    x1: Number(match[1]),
    y1: Number(match[2]),
    x2: Number(match[3]),
    y2: Number(match[4]),
  };
}

function toCrawlCoupons(source: string, coupons: ParsedGenericCoupon[]): CrawlCouponInput[] {
  const ids = new Map<string, number>();
  return coupons.map((coupon) => {
    const detail = coupon.detail;
    const validUntil = detail?.validUntil ?? coupon.validUntil;
    const paymentAmount = detail?.paymentAmountKrw ?? coupon.couponPriceKrw;
    const baseId = `${source}-${stableHash(
      `${coupon.title}|${validUntil ?? ''}|${paymentAmount ?? ''}|${coupon.discountPercent ?? ''}`
    )}`;
    const seen = ids.get(baseId) ?? 0;
    ids.set(baseId, seen + 1);

    return {
      external_id: seen === 0 ? baseId : `${baseId}-${seen + 1}`,
      title: coupon.title,
      discount_type: resolveDiscountType(coupon),
      discount_value: resolveDiscountValue(coupon),
      valid_until: validUntil,
      is_active: true,
      raw_payload: {
        coupon_kind: detail?.couponKind ?? null,
        is_weekly_coupon: detail?.isWeeklyCoupon ?? false,
        valid_from: detail?.validFrom ?? null,
        valid_until: validUntil,
        valid_period_text: detail?.validPeriodText ?? null,
        order_methods: detail?.orderMethods ?? [],
        product_price_krw: detail?.productPriceKrw ?? coupon.originalPriceKrw,
        discount_amount_krw:
          detail?.discountAmountKrw ??
          deriveDiscountAmount(coupon.originalPriceKrw, coupon.couponPriceKrw),
        payment_amount_krw: paymentAmount,
        app_link: detail?.appLink ?? null,
        original_price_krw: coupon.originalPriceKrw,
        coupon_price_krw: coupon.couponPriceKrw,
        discount_percent: coupon.discountPercent,
        detail: detail
          ? {
              title: detail.title,
              coupon_kind: detail.couponKind,
              is_weekly_coupon: detail.isWeeklyCoupon,
              valid_from: detail.validFrom,
              valid_until: detail.validUntil,
              valid_period_text: detail.validPeriodText,
              order_methods: detail.orderMethods,
              product_price_krw: detail.productPriceKrw,
              discount_amount_krw: detail.discountAmountKrw,
              payment_amount_krw: detail.paymentAmountKrw,
              app_link: detail.appLink,
              source_texts: detail.sourceTexts,
            }
          : null,
        source_texts: coupon.sourceTexts,
      },
    };
  });
}

function resolveDiscountType(coupon: ParsedGenericCoupon): CrawlCouponInput['discount_type'] {
  if (coupon.discountPercent !== null) return '정률';
  const productPrice = coupon.detail?.productPriceKrw ?? coupon.originalPriceKrw;
  const paymentAmount = coupon.detail?.paymentAmountKrw ?? coupon.couponPriceKrw;
  if (productPrice !== null && paymentAmount !== null) return '정액';
  if (paymentAmount !== null) return '세트';
  return '정액';
}

function resolveDiscountValue(coupon: ParsedGenericCoupon): number {
  if (coupon.discountPercent !== null) return coupon.discountPercent;
  if (coupon.detail?.discountAmountKrw !== null && coupon.detail?.discountAmountKrw !== undefined) {
    return coupon.detail.discountAmountKrw;
  }
  if (coupon.originalPriceKrw !== null && coupon.couponPriceKrw !== null) {
    return Math.max(0, coupon.originalPriceKrw - coupon.couponPriceKrw);
  }
  if (coupon.couponPriceKrw !== null) return coupon.couponPriceKrw;
  return 0;
}

function uniqueCoupons(coupons: ParsedGenericCoupon[]): ParsedGenericCoupon[] {
  const seen = new Set<string>();
  return coupons.filter((coupon) => {
    const key = couponFingerprint(coupon);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function mergeCollectedCoupon(
  collected: Map<string, ParsedGenericCoupon>,
  coupon: ParsedGenericCoupon
): void {
  const key = couponFingerprint(coupon);
  const existing = collected.get(key);
  if (!existing) {
    collected.set(key, coupon);
    return;
  }

  existing.sourceTexts = uniqueInOrder([...existing.sourceTexts, ...coupon.sourceTexts]);
  if (!existing.detail) {
    existing.detail = coupon.detail;
    return;
  }
  if (!coupon.detail) return;

  existing.detail = {
    ...existing.detail,
    orderMethods: uniqueInOrder([
      ...existing.detail.orderMethods,
      ...coupon.detail.orderMethods,
    ]),
    sourceTexts: uniqueInOrder([
      ...existing.detail.sourceTexts,
      ...coupon.detail.sourceTexts,
    ]),
    appLink: existing.detail.appLink ?? coupon.detail.appLink,
  };
}

function couponFingerprint(coupon: ParsedGenericCoupon): string {
  return [
    coupon.title,
    coupon.validUntil ?? '',
    coupon.originalPriceKrw ?? '',
    coupon.couponPriceKrw ?? '',
    coupon.discountPercent ?? '',
  ].join('|');
}

function uniqueNumbers(values: number[]): number[] {
  const seen = new Set<number>();
  return values.filter((value) => {
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function uniqueInOrder(texts: string[]): string[] {
  const seen = new Set<string>();
  return texts.filter((text) => {
    if (seen.has(text)) return false;
    seen.add(text);
    return true;
  });
}

function normalizeKorean(text: string): string {
  return text.replace(/\s+/g, '');
}

function hasHangul(text: string): boolean {
  return /[가-힣]/.test(text);
}

function stableHash(input: string): string {
  let hash = 2166136261;
  for (const char of input) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
