import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  findTransientUiDismissTarget,
  looksLikeTransientUi,
  type TransientUiOptions,
} from './adbUi.ts';
import type { CrawlAdapter, CrawlCouponInput, CrawlPayload } from '../types.ts';

const SOURCE = 'burgerking-kr-adb';
const PACKAGE_NAME = 'kr.co.burgerkinghybrid';
const REMOTE_XML_PATH = '/sdcard/burgerking-window.xml';
const MAX_SWIPES = 12;
const DEFAULT_WAIT_MS = 1500;
const OCR_SCRIPT_PATH = join(process.cwd(), 'scripts', 'ocr-image-text.swift');
const TRANSIENT_UI_OPTIONS: TransientUiOptions = {
  transientHintPatterns: [
    /마이팩\s*할인\s*쿠폰\s*선택하기/,
    /할인\s*쿠폰\s*선택/,
    /원하는\s*할인\s*금액/,
  ],
};

interface UiNode {
  index: string;
  text: string;
  className: string;
  contentDesc: string;
  bounds: string;
  children: UiNode[];
}

interface Point {
  x: number;
  y: number;
}

interface ParsedCouponListEntry {
  coupon: ParsedCoupon;
  detailTapPoint: Point | null;
}

export interface ParsedCouponDetail {
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

export interface ParsedCoupon {
  title: string;
  validUntil: string | null;
  categories: string[];
  imageId: string | null;
  originalPriceKrw: number | null;
  couponPriceKrw: number | null;
  discountPercent: number | null;
  detail: ParsedCouponDetail | null;
  sourceTexts: string[];
}

export const burgerkingKrAdbAdapter: CrawlAdapter = {
  source: SOURCE,
  async crawl() {
    const adbPath = resolveAdbPath();

    runAdb(adbPath, ['devices']);
    ensurePackageInstalled(adbPath);
    const launchOutput = runAdb(adbPath, ['shell', 'monkey', '-p', PACKAGE_NAME, '1']);
    if (!launchOutput.includes('Events injected')) {
      throw new Error(`Could not launch Burger King app with monkey: ${launchOutput.trim()}`);
    }
    await wait(2500);
    await settleTransientUi(adbPath);

    await ensureCouponScreen(adbPath);

    const firstXml = dumpUiXml(adbPath);
    const firstEntries = parseBurgerKingCouponEntriesFromXml(firstXml);
    let expectedCount = parseExpectedCouponCount(firstXml);
    const parsedCoupons =
      firstEntries.length === 0
        ? await crawlCouponsFromOcr(adbPath, expectedCount)
        : await crawlCouponsFromUiXml(adbPath, firstXml, expectedCount);
    const coupons = toCrawlCoupons(parsedCoupons);
    if (coupons.length === 0) {
      throw new Error('Burger King coupon crawl found no coupons in the UI XML.');
    }

    return {
      brand: {
        source: SOURCE,
        external_id: 'burgerking',
        name: '버거킹',
        app_scheme: 'burgerking://main',
        store_url: 'https://www.burgerking.co.kr',
        app_store_url: 'https://play.google.com/store/apps/details?id=kr.co.burgerkinghybrid',
      },
      stores: [],
      coupons,
    };
  },
};

export function parseBurgerKingCouponsFromXml(xml: string): ParsedCoupon[] {
  return parseBurgerKingCouponEntriesFromXml(xml).map((entry) => entry.coupon);
}

export function parseBurgerKingCouponDetailFromXml(
  xml: string,
  fallbackCoupon: ParsedCoupon | null = null
): ParsedCouponDetail | null {
  const root = parseUiXml(xml);
  const texts = uniqueInOrder(
    collectTexts(root).filter((text) => text !== 'root' && text !== 'coupon detail')
  );
  return parseBurgerKingCouponDetailFromTexts(texts, fallbackCoupon);
}

export function parseBurgerKingCouponDetailFromTexts(
  texts: string[],
  fallbackCoupon: ParsedCoupon | null = null
): ParsedCouponDetail | null {
  if (texts.length === 0) return null;
  if (!isCouponDetailTextSet(texts)) return null;

  const validPeriod = parseValidPeriod(texts);
  const productPriceKrw =
    parseLabeledKrw(texts, PRODUCT_PRICE_LABELS) ?? fallbackCoupon?.originalPriceKrw ?? null;
  const paymentAmountKrw =
    parseLabeledKrw(texts, PAYMENT_AMOUNT_LABELS) ?? fallbackCoupon?.couponPriceKrw ?? null;
  const discountAmountKrw =
    parseLabeledKrw(texts, DISCOUNT_AMOUNT_LABELS, true) ??
    deriveDiscountAmount(productPriceKrw, paymentAmountKrw);
  const fallbackKind = fallbackCoupon?.categories.find((category) => category !== 'HOT') ?? null;
  const couponKind = parseCouponKind(texts) ?? fallbackKind;
  const isWeeklyCoupon =
    couponKind === '위클리' || texts.some((text) => normalizeKorean(text).includes('위클리'));

  return {
    title: parseDetailTitle(texts),
    couponKind,
    isWeeklyCoupon,
    validFrom: validPeriod.validFrom,
    validUntil: validPeriod.validUntil ?? fallbackCoupon?.validUntil ?? null,
    validPeriodText: validPeriod.validPeriodText,
    orderMethods: parseOrderMethods(texts),
    productPriceKrw,
    discountAmountKrw,
    paymentAmountKrw,
    appLink: parseAppLink(texts),
    sourceTexts: texts,
  };
}

async function crawlCouponsFromUiXml(
  adbPath: string,
  firstXml: string,
  initialExpectedCount: number | null
): Promise<ParsedCoupon[]> {
  const collected = new Map<string, ParsedCoupon>();
  const detailsByFingerprint = new Map<string, ParsedCouponDetail>();
  const skippedDetailFingerprints = new Set<string>();
  const size = getScreenSize(adbPath);
  let bestSnapshot: ParsedCoupon[] = [];
  let expectedCount = initialExpectedCount;

  for (let attempt = 0; attempt <= MAX_SWIPES; attempt += 1) {
    const xml = attempt === 0 ? firstXml : dumpUiXml(adbPath);
    if (await dismissTransientUiIfPresent(adbPath, xml)) continue;
    expectedCount ??= parseExpectedCouponCount(xml);
    const snapshotEntries = parseBurgerKingCouponEntriesFromXml(xml);
    await enrichVisibleCouponDetails(
      adbPath,
      snapshotEntries,
      detailsByFingerprint,
      skippedDetailFingerprints
    );
    const snapshotCoupons = snapshotEntries.map((entry) => entry.coupon);
    const settledDetailCount = detailsByFingerprint.size + skippedDetailFingerprints.size;

    if (snapshotCoupons.length > bestSnapshot.length) {
      bestSnapshot = snapshotCoupons;
    }
    if (
      expectedCount !== null &&
      snapshotCoupons.length >= expectedCount &&
      settledDetailCount >= expectedCount
    ) {
      bestSnapshot = snapshotCoupons.slice(0, expectedCount);
      break;
    }

    for (const [index, coupon] of snapshotCoupons.entries()) {
      const fingerprint = couponFingerprint(coupon);
      const occurrence =
        snapshotCoupons
          .slice(0, index)
          .filter((previous) => couponFingerprint(previous) === fingerprint).length + 1;
      collected.set(`${fingerprint}|${occurrence}`, coupon);
    }

    if (
      expectedCount !== null &&
      collected.size >= expectedCount &&
      settledDetailCount >= expectedCount
    ) {
      break;
    }
    if (attempt === MAX_SWIPES) break;

    runAdb(adbPath, [
      'shell',
      'input',
      'swipe',
      String(Math.round(size.width * 0.5)),
      String(Math.round(size.height * 0.78)),
      String(Math.round(size.width * 0.5)),
      String(Math.round(size.height * 0.27)),
      '550',
    ]);
    await wait(DEFAULT_WAIT_MS);
  }

  const parsedCoupons = expectedCount !== null && bestSnapshot.length >= expectedCount
    ? bestSnapshot
    : bestSnapshot.length >= collected.size
      ? bestSnapshot
      : [...collected.values()];

  for (const coupon of parsedCoupons) {
    coupon.detail ??= detailsByFingerprint.get(couponFingerprint(coupon)) ?? null;
  }

  return parsedCoupons;
}

async function crawlCouponsFromOcr(
  adbPath: string,
  initialExpectedCount: number | null
): Promise<ParsedCoupon[]> {
  const size = getScreenSize(adbPath);
  const collected = new Map<string, ParsedCoupon>();
  let expectedCount = initialExpectedCount;

  for (let attempt = 0; attempt <= MAX_SWIPES; attempt += 1) {
    const xml = dumpUiXml(adbPath);
    if (await dismissTransientUiIfPresent(adbPath, xml)) continue;
    expectedCount ??= parseExpectedCouponCount(xml);

    const rows = ocrCurrentScreenRows(adbPath);
    const texts = rows.map((row) => row.text);
    expectedCount ??= parseExpectedCouponCountFromTexts(texts);

    for (const tapPoint of findOcrCouponTapPoints(rows, size)) {
      const detail = await fetchCouponDetailAtPoint(adbPath, tapPoint, null);
      if (!detail) continue;

      const coupon = couponFromDetail(detail);
      collected.set(couponFingerprint(coupon), coupon);
      if (expectedCount !== null && collected.size >= expectedCount) break;
    }

    if (expectedCount !== null && collected.size >= expectedCount) break;
    if (attempt === MAX_SWIPES) break;

    runAdb(adbPath, [
      'shell',
      'input',
      'swipe',
      String(Math.round(size.width * 0.5)),
      String(Math.round(size.height * 0.78)),
      String(Math.round(size.width * 0.5)),
      String(Math.round(size.height * 0.27)),
      '550',
    ]);
    await wait(DEFAULT_WAIT_MS);
  }

  return [...collected.values()];
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

  throw new Error(
    'ADB was not found. Set ADB_PATH or ANDROID_HOME/ANDROID_SDK_ROOT before crawling.'
  );
}

async function ensureCouponScreen(adbPath: string): Promise<void> {
  const size = getScreenSize(adbPath);

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const xml = dumpUiXml(adbPath);
    if (await dismissTransientUiIfPresent(adbPath, xml)) continue;
    if (isCouponScreen(xml)) return;

    const couponButton =
      findTextButtonCenter(xml, '쿠폰 전체보기') ??
      findHomeCouponMoreButtonCenter(xml) ??
      findTextButtonCenter(xml, '쿠폰');

    if (couponButton) {
      runAdb(adbPath, ['shell', 'input', 'tap', String(couponButton.x), String(couponButton.y)]);
      await wait(DEFAULT_WAIT_MS);
      continue;
    }

    if (attempt < 5 && looksLikeHomeCouponTeaser(xml)) {
      scrollTowardHomeTop(adbPath, size);
      await wait(DEFAULT_WAIT_MS);
      continue;
    }

    const target = {
      x: Math.round(size.width * 0.3),
      y: Math.round(size.height * 0.92),
    };

    runAdb(adbPath, ['shell', 'input', 'tap', String(target.x), String(target.y)]);
    await wait(DEFAULT_WAIT_MS);
  }

  throw new Error('Could not navigate to the Burger King coupon screen with ADB.');
}

async function settleTransientUi(adbPath: string, maxAttempts = 3): Promise<void> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const xml = dumpUiXml(adbPath);
    if (!(await dismissTransientUiIfPresent(adbPath, xml))) return;
  }
}

async function dismissTransientUiIfPresent(adbPath: string, xml: string): Promise<boolean> {
  const target = findTransientUiDismissTarget(xml, TRANSIENT_UI_OPTIONS);
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

  if (looksLikeTransientUi(xml, TRANSIENT_UI_OPTIONS)) {
    runAdb(adbPath, ['shell', 'input', 'keyevent', 'KEYCODE_BACK']);
    await wait(800);
    return true;
  }

  return false;
}

function isCouponScreen(xml: string): boolean {
  return xml.includes('text="보유쿠폰 ') && xml.includes('text="매장별"');
}

function looksLikeHomeCouponTeaser(xml: string): boolean {
  return (
    xml.includes('text="할인쿠폰"') ||
    xml.includes('text="쿠폰 전체보기"') ||
    xml.includes('text="지금 바로 사용 가능한"')
  );
}

function findHomeCouponMoreButtonCenter(xml: string): { x: number; y: number } | null {
  const root = parseUiXml(xml);
  const headings: UiNode[] = [];
  const moreButtons: UiNode[] = [];

  function visit(node: UiNode): void {
    if (node.text === '할인쿠폰') headings.push(node);
    if (node.text === '더보기' && node.className === 'android.widget.Button') {
      moreButtons.push(node);
    }
    node.children.forEach(visit);
  }

  visit(root);

  for (const heading of headings) {
    const headingBounds = parseBounds(heading.bounds);
    if (
      !headingBounds ||
      headingBounds.x2 <= headingBounds.x1 ||
      headingBounds.y2 <= headingBounds.y1
    ) {
      continue;
    }

    for (const button of moreButtons) {
      const buttonCenter = nodeCenter(button);
      if (!buttonCenter) continue;
      if (buttonCenter.x <= headingBounds.x2) continue;
      if (
        buttonCenter.y >= headingBounds.y1 - 80 &&
        buttonCenter.y <= headingBounds.y2 + 120
      ) {
        return { x: Math.round(buttonCenter.x), y: Math.round(buttonCenter.y) };
      }
    }
  }

  return null;
}

function scrollTowardHomeTop(adbPath: string, size: { width: number; height: number }): void {
  runAdb(adbPath, [
    'shell',
    'input',
    'swipe',
    String(Math.round(size.width * 0.5)),
    String(Math.round(size.height * 0.3)),
    String(Math.round(size.width * 0.5)),
    String(Math.round(size.height * 0.82)),
    '450',
  ]);
}

function ensurePackageInstalled(adbPath: string): void {
  const output = runAdb(adbPath, ['shell', 'pm', 'path', PACKAGE_NAME]);
  if (!output.includes(`package:`)) {
    throw new Error(
      `Burger King app is not installed on the selected emulator: ${PACKAGE_NAME}`
    );
  }
}

function findTextButtonCenter(xml: string, text: string): { x: number; y: number } | null {
  const root = parseUiXml(xml);
  const candidates: UiNode[] = [];

  function visit(node: UiNode): void {
    if (node.text === text && node.className === 'android.widget.Button') {
      candidates.push(node);
    }
    node.children.forEach(visit);
  }

  visit(root);

  const visibleCandidates = candidates.filter((node) => {
    const bounds = parseBounds(node.bounds);
    return bounds !== null && bounds.x2 > bounds.x1 && bounds.y2 > bounds.y1;
  });

  const candidate =
    visibleCandidates.find((node) => {
      const bounds = parseBounds(node.bounds);
      return bounds !== null && bounds.y1 > 1500;
    }) ?? visibleCandidates[0];

  const bounds = candidate ? parseBounds(candidate.bounds) : null;
  if (!bounds) return null;

  return {
    x: Math.round((bounds.x1 + bounds.x2) / 2),
    y: Math.round((bounds.y1 + bounds.y2) / 2),
  };
}

function getScreenSize(adbPath: string): { width: number; height: number } {
  const output = runAdb(adbPath, ['shell', 'wm', 'size']);
  const match = output.match(/Physical size:\s*(\d+)x(\d+)/);
  if (!match) return { width: 1080, height: 2424 };
  return { width: Number(match[1]), height: Number(match[2]) };
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

function runAdbBuffer(adbPath: string, args: string[], maxBuffer = 16 * 1024 * 1024): Buffer {
  const effectiveArgs = withAdbSerial(args);
  const result = spawnSync(adbPath, effectiveArgs, {
    maxBuffer,
  });

  if (result.status !== 0) {
    const stderr = result.stderr.toString('utf8').trim();
    const stdout = result.stdout.toString('utf8').trim();
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

function parseExpectedCouponCount(xml: string): number | null {
  const match = xml.match(/text="보유쿠폰\s*(\d+)장"/);
  return match ? Number(match[1]) : null;
}

function parseExpectedCouponCountFromTexts(texts: string[]): number | null {
  const countText = texts.find((text) => /보유\s*쿠폰\s*\d+\s*장/.test(text));
  const match = countText?.match(/(\d+)\s*장/);
  return match ? Number(match[1]) : null;
}

function isCouponScreenTextSet(texts: string[]): boolean {
  return texts.some((text) => /보유\s*쿠폰\s*\d+\s*장/.test(text));
}

function isCouponDetailTextSet(texts: string[]): boolean {
  return texts.some((text) => text.includes('쿠폰정보')) && texts.some((text) => /결제\s*금액/.test(text));
}

function parseBurgerKingCouponEntriesFromXml(xml: string): ParsedCouponListEntry[] {
  const root = parseUiXml(xml);
  const cardNodes = findCouponCardNodes(root);
  return cardNodes
    .map(parseCouponCardEntry)
    .filter((entry): entry is ParsedCouponListEntry => entry !== null);
}

function parseUiXml(xml: string): UiNode {
  const root: UiNode = emptyNode('root');
  const stack: UiNode[] = [root];
  const tagPattern = /<node\b([^>]*?)(\/?)>|<\/node>/g;

  for (const match of xml.matchAll(tagPattern)) {
    const fullTag = match[0];
    if (fullTag === '</node>') {
      if (stack.length > 1) stack.pop();
      continue;
    }

    const attrs = parseAttributes(match[1] ?? '');
    const node: UiNode = {
      index: attrs.index ?? '',
      text: decodeXml(attrs.text ?? ''),
      className: decodeXml(attrs.class ?? ''),
      contentDesc: decodeXml(attrs['content-desc'] ?? ''),
      bounds: decodeXml(attrs.bounds ?? ''),
      children: [],
    };

    stack[stack.length - 1].children.push(node);
    if (match[2] !== '/') stack.push(node);
  }

  return root;
}

function emptyNode(text: string): UiNode {
  return {
    index: '',
    text,
    className: '',
    contentDesc: '',
    bounds: '',
    children: [],
  };
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

function findCouponCardNodes(root: UiNode): UiNode[] {
  const cards: UiNode[] = [];

  function visit(node: UiNode): void {
    const hasDetailButton = node.children.some(
      (child) => child.text === 'coupon detail' && child.className === 'android.widget.Button'
    );
    if (hasDetailButton) {
      cards.push(node);
      return;
    }
    node.children.forEach(visit);
  }

  visit(root);
  return cards;
}

function parseCouponCardEntry(card: UiNode): ParsedCouponListEntry | null {
  const coupon = parseCouponCard(card);
  if (!coupon) return null;

  const detailButton = card.children.find(
    (child) => child.text === 'coupon detail' && child.className === 'android.widget.Button'
  );

  return {
    coupon,
    detailTapPoint: nodeCenter(detailButton) ?? nodeCenter(card),
  };
}

function parseCouponCard(card: UiNode): ParsedCoupon | null {
  const texts = collectTexts(card).filter((text) => text !== 'coupon detail');
  const imageId = texts.find(isUuid) ?? null;
  const categories = texts.filter(isCategoryText);
  const dateText = texts.find((text) => /^\d{4}\.\d{2}\.\d{2}\s*까지$/.test(text));
  const validUntil = dateText ? dateText.replace(/\./g, '-').replace(/\s*까지$/, '') : null;
  const prices = texts.filter(isPriceText).map(parseKrw);
  const discountText = texts.find((text) => /^\d+%\s*할인$/.test(text));
  const discountPercent = discountText ? Number(discountText.match(/^(\d+)%/)?.[1]) : null;
  const title = texts.find(isTitleText);

  if (!title) return null;

  return {
    title,
    validUntil,
    categories,
    imageId,
    originalPriceKrw: prices.length >= 2 ? prices[0] : null,
    couponPriceKrw: prices.length > 0 ? prices[prices.length - 1] : null,
    discountPercent,
    detail: null,
    sourceTexts: texts,
  };
}

async function enrichVisibleCouponDetails(
  adbPath: string,
  entries: ParsedCouponListEntry[],
  detailsByFingerprint: Map<string, ParsedCouponDetail>,
  skippedDetailFingerprints: Set<string>
): Promise<void> {
  const size = getScreenSize(adbPath);

  for (const entry of entries) {
    const fingerprint = couponFingerprint(entry.coupon);
    if (skippedDetailFingerprints.has(fingerprint)) continue;

    const cachedDetail = detailsByFingerprint.get(fingerprint);
    if (cachedDetail) {
      entry.coupon.detail = cachedDetail;
      continue;
    }
    if (!entry.detailTapPoint) continue;
    if (!isVisibleTapPoint(entry.detailTapPoint, size)) continue;

    const detail = await fetchCouponDetail(adbPath, entry);
    if (!detail) {
      skippedDetailFingerprints.add(fingerprint);
      continue;
    }

    detailsByFingerprint.set(fingerprint, detail);
    entry.coupon.detail = detail;
  }
}

async function fetchCouponDetail(
  adbPath: string,
  entry: ParsedCouponListEntry
): Promise<ParsedCouponDetail | null> {
  if (!entry.detailTapPoint) return null;
  return fetchCouponDetailAtPoint(adbPath, entry.detailTapPoint, entry.coupon);
}

async function fetchCouponDetailAtPoint(
  adbPath: string,
  tapPoint: Point,
  fallbackCoupon: ParsedCoupon | null
): Promise<ParsedCouponDetail | null> {
  runAdb(adbPath, [
    'shell',
    'input',
    'tap',
    String(Math.round(tapPoint.x)),
    String(Math.round(tapPoint.y)),
  ]);
  await wait(DEFAULT_WAIT_MS);

  try {
    const xml = dumpUiXml(adbPath);
    const xmlDetail = parseBurgerKingCouponDetailFromXml(xml, fallbackCoupon);
    if (xmlDetail) return xmlDetail;

    return parseBurgerKingCouponDetailFromTexts(ocrCurrentScreen(adbPath), fallbackCoupon);
  } finally {
    runAdb(adbPath, ['shell', 'input', 'keyevent', 'KEYCODE_BACK']);
    await wait(DEFAULT_WAIT_MS);
  }
}

function collectTexts(node: UiNode, output: string[] = []): string[] {
  const text = node.text.trim();
  if (text.length > 0) output.push(text);
  node.children.forEach((child) => collectTexts(child, output));
  return output;
}

function isCategoryText(text: string): boolean {
  return ['위클리', '먼슬리', '스페셜', '기간한정', '이벤트', '멤버십', 'HOT'].includes(text);
}

function isUuid(text: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text);
}

function isPriceText(text: string): boolean {
  return /^\d{1,3}(,\d{3})*원$/.test(text);
}

function parseKrw(text: string): number {
  return Number(text.replace(/[^\d-]/g, ''));
}

function parseKrwAmounts(text: string): number[] {
  return [...text.matchAll(/-?\s*\d{1,3}(?:,\d{3})*\s*원/g)].map((match) => parseKrw(match[0]));
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

function isTitleText(text: string): boolean {
  if (isUuid(text)) return false;
  if (isCategoryText(text)) return false;
  if (text.startsWith('ico_')) return false;
  if (isPriceText(text)) return false;
  if (/^\d{4}\.\d{2}\.\d{2}\s*까지$/.test(text)) return false;
  if (/^\d+%\s*할인$/.test(text)) return false;
  if (['선택하기', '쿠폰', '전체', '매장별'].includes(text)) return false;
  return true;
}

function toCrawlCoupons(parsedCoupons: ParsedCoupon[]): CrawlCouponInput[] {
  const baseIds = new Map<string, number>();

  return parsedCoupons.map((coupon) => {
    const validUntil = coupon.detail?.validUntil ?? coupon.validUntil;
    const baseId = coupon.imageId
      ? `bk-${coupon.imageId}`
      : `bk-${stableHash(
          `${coupon.title}|${validUntil ?? ''}|${coupon.couponPriceKrw ?? ''}`
        )}`;
    const seen = baseIds.get(baseId) ?? 0;
    baseIds.set(baseId, seen + 1);
    const externalId = seen === 0 ? baseId : `${baseId}-${seen + 1}`;

    return {
      external_id: externalId,
      title: coupon.title,
      discount_type: resolveDiscountType(coupon),
      discount_value: resolveDiscountValue(coupon),
      valid_until: validUntil,
      is_active: true,
      raw_payload: {
        categories: coupon.categories,
        is_weekly_coupon: coupon.detail?.isWeeklyCoupon ?? coupon.categories.includes('위클리'),
        image_id: coupon.imageId,
        original_price_krw: coupon.originalPriceKrw,
        coupon_price_krw: coupon.couponPriceKrw,
        discount_percent: coupon.discountPercent,
        detail: coupon.detail
          ? {
              title: coupon.detail.title,
              coupon_kind: coupon.detail.couponKind,
              is_weekly_coupon: coupon.detail.isWeeklyCoupon,
              valid_from: coupon.detail.validFrom,
              valid_until: coupon.detail.validUntil,
              valid_period_text: coupon.detail.validPeriodText,
              order_methods: coupon.detail.orderMethods,
              product_price_krw: coupon.detail.productPriceKrw,
              discount_amount_krw: coupon.detail.discountAmountKrw,
              payment_amount_krw: coupon.detail.paymentAmountKrw,
              app_link: coupon.detail.appLink,
              source_texts: coupon.detail.sourceTexts,
            }
          : null,
        source_texts: coupon.sourceTexts,
      },
    };
  });
}

function resolveDiscountType(coupon: ParsedCoupon): CrawlCouponInput['discount_type'] {
  if (coupon.discountPercent !== null) return '정률';
  if (coupon.originalPriceKrw !== null && coupon.couponPriceKrw !== null) return '정액';
  if (coupon.couponPriceKrw !== null) return '세트';
  return '정액';
}

function resolveDiscountValue(coupon: ParsedCoupon): number {
  if (coupon.discountPercent !== null) return coupon.discountPercent;
  if (coupon.originalPriceKrw !== null && coupon.couponPriceKrw !== null) {
    return Math.max(0, coupon.originalPriceKrw - coupon.couponPriceKrw);
  }
  if (coupon.couponPriceKrw !== null) return coupon.couponPriceKrw;
  return 0;
}

function couponFingerprint(coupon: ParsedCoupon): string {
  return [
    coupon.title,
    coupon.validUntil ?? '',
    coupon.imageId ?? '',
    coupon.originalPriceKrw ?? '',
    coupon.couponPriceKrw ?? '',
    coupon.discountPercent ?? '',
  ].join('|');
}

function nodeCenter(node: UiNode | undefined): Point | null {
  if (!node) return null;
  const match = node.bounds.match(/^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/);
  if (!match) return null;

  const left = Number(match[1]);
  const top = Number(match[2]);
  const right = Number(match[3]);
  const bottom = Number(match[4]);
  if (![left, top, right, bottom].every(Number.isFinite) || right <= left || bottom <= top) {
    return null;
  }

  return {
    x: (left + right) / 2,
    y: (top + bottom) / 2,
  };
}

function isVisibleTapPoint(point: Point, size: { width: number; height: number }): boolean {
  return (
    point.x > 0 &&
    point.x < size.width &&
    point.y > size.height * 0.08 &&
    point.y < size.height * 0.93
  );
}

const PRODUCT_PRICE_LABELS = [/제품\s*금액/, /상품\s*금액/, /정상\s*금액/, /정상가/, /제품가/, /판매가/];
const DISCOUNT_AMOUNT_LABELS = [/할인\s*금액/, /할인액/, /쿠폰\s*할인/];
const PAYMENT_AMOUNT_LABELS = [
  /결제\s*금액/,
  /결제액/,
  /쿠폰\s*가격/,
  /쿠폰가/,
  /구매\s*금액/,
  /최종\s*결제/,
];

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

  for (const text of texts) {
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

function parseDateOnlyTexts(text: string): string[] {
  const dottedDates = [...text.matchAll(/(\d{4})[.-](\d{2})[.-](\d{2})/g)].map(
    (match) => `${match[1]}-${match[2]}-${match[3]}`
  );
  const koreanDates = [...text.matchAll(/(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/g)].map(
    (match) =>
      `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`
  );
  return [...dottedDates, ...koreanDates];
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
  const category = texts.find(isCategoryText);
  if (category) return category;

  const weeklyText = texts.find((text) => normalizeKorean(text).includes('위클리'));
  if (weeklyText) return '위클리';

  const labelIndex = texts.findIndex((text) => /쿠폰\s*(종류|유형|타입)/.test(text));
  if (labelIndex < 0) return null;

  for (const text of texts.slice(labelIndex, Math.min(texts.length, labelIndex + 3))) {
    const kind = text.replace(/쿠폰\s*(종류|유형|타입)/g, '').trim();
    if (kind && isCategoryText(kind)) return kind;
  }

  return null;
}

function parseDetailTitle(texts: string[]): string | null {
  const couponInfoIndex = texts.findIndex((text) => text.includes('쿠폰정보'));
  const candidates = couponInfoIndex >= 0 ? texts.slice(0, couponInfoIndex) : texts;

  for (const text of candidates.slice().reverse()) {
    if (!hasHangul(text)) continue;
    if (/^\d{1,2}:\d{2}$/.test(text)) continue;
    if (/^\d+$/.test(text.replace(/\s+/g, ''))) continue;
    if (['쿠폰', 'X'].includes(text)) continue;
    if (text.includes('쿠폰')) continue;
    return text;
  }

  return null;
}

function couponFromDetail(detail: ParsedCouponDetail): ParsedCoupon {
  const categories = detail.couponKind ? [detail.couponKind] : [];

  return {
    title: detail.title ?? '버거킹 쿠폰',
    validUntil: detail.validUntil,
    categories,
    imageId: null,
    originalPriceKrw: detail.productPriceKrw,
    couponPriceKrw: detail.paymentAmountKrw,
    discountPercent: null,
    detail,
    sourceTexts: detail.sourceTexts,
  };
}

function parseOrderMethods(texts: string[]): string[] {
  const methods = new Set<string>();

  for (const text of texts) {
    const normalized = normalizeKorean(text);
    if (normalized.includes('킹오더')) methods.add('킹오더');
    if (normalized.includes('딜리버리')) methods.add('딜리버리');
    if (normalized.includes('매장') && /주문방법|매장\/|\/매장|매장$/.test(normalized)) {
      methods.add('매장');
    }
    if (normalized.includes('매장주문')) methods.add('매장주문');
    if (normalized.includes('방문주문')) methods.add('방문주문');
    if (normalized.includes('포장')) methods.add('포장');
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

function findOcrCouponTapPoints(rows: OcrText[], size: { width: number; height: number }): Point[] {
  const bySlot = new Map<string, OcrText>();

  for (const row of rows) {
    if (!isCouponTitleOcrRow(row.text)) continue;
    if (row.y < 0.25 || row.y > 0.9) continue;

    const column = row.x < 0.5 ? 'left' : 'right';
    const rowBucket = Math.floor((row.y - 0.25) / 0.24);
    const key = `${column}:${rowBucket}`;
    const previous = bySlot.get(key);

    if (!previous || row.y < previous.y) {
      bySlot.set(key, row);
    }
  }

  return [...bySlot.values()]
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((row) => ({
      x: Math.round((row.x + row.width / 2) * size.width),
      y: Math.round((row.y + row.height / 2) * size.height),
    }));
}

function isCouponTitleOcrRow(text: string): boolean {
  if (!hasHangul(text)) return false;
  if (/^\d{4}[.-]\d{2}[.-]\d{2}/.test(text)) return false;
  if (parseKrwAmounts(text).length > 0) return false;
  if (/^\d+%\s*할인$/.test(text)) return false;
  if (
    [
      '쿠폰',
      '쿠폰정보',
      '쿠폰명',
      '유효기간',
      '주문방법',
      '제품금액',
      '할인금액',
      '결제금액',
      '보유쿠폰',
      '매장별',
      '매정별',
      '전체',
      '멤버십',
      '스페셜',
      '기간한정',
      '이벤트',
      '홈',
      '주문',
      '더보기',
    ].some((blocked) => text.includes(blocked))
  ) {
    return false;
  }

  return /세트|와퍼|버거|킹|치즈|소스|조각|너겟|프라이|콜라|치킨/.test(text);
}

function normalizeKorean(text: string): string {
  return text.replace(/\s+/g, '');
}

function hasHangul(text: string): boolean {
  return /[가-힣]/.test(text);
}

function uniqueInOrder(texts: string[]): string[] {
  const seen = new Set<string>();
  return texts.filter((text) => {
    if (seen.has(text)) return false;
    seen.add(text);
    return true;
  });
}

interface OcrText {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

function ocrCurrentScreen(adbPath: string): string[] {
  return ocrCurrentScreenRows(adbPath).map((row) => row.text);
}

function ocrCurrentScreenRows(adbPath: string): OcrText[] {
  if (!existsSync(OCR_SCRIPT_PATH)) return [];

  const tempDir = mkdtempSync(join(tmpdir(), 'burgerking-ocr-'));
  const screenshotPath = join(tempDir, 'screen.png');

  try {
    writeFileSync(screenshotPath, runAdbBuffer(adbPath, ['exec-out', 'screencap', '-p']));
    const result = spawnSync('swift', [OCR_SCRIPT_PATH, screenshotPath], {
      encoding: 'utf8',
      env: {
        ...process.env,
        CLANG_MODULE_CACHE_PATH:
          process.env.CLANG_MODULE_CACHE_PATH ?? join(tempDir, 'clang-module-cache'),
        SWIFT_MODULE_CACHE_PATH:
          process.env.SWIFT_MODULE_CACHE_PATH ?? join(tempDir, 'swift-module-cache'),
      },
      maxBuffer: 4 * 1024 * 1024,
    });

    if (result.status !== 0) return [];

    const rows = JSON.parse(result.stdout) as OcrText[];
    const seen = new Set<string>();
    return rows
      .sort((a, b) => a.y - b.y || a.x - b.x)
      .map((row) => ({ ...row, text: row.text.trim() }))
      .filter((row) => {
        if (row.text.length === 0) return false;
        const key = `${row.text}|${row.x.toFixed(3)}|${row.y.toFixed(3)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  } catch {
    return [];
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function stableHash(input: string): string {
  let hash = 2166136261;
  for (const char of input) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
