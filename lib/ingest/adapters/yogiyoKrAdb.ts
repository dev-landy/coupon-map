import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

import {
  extractUiNodeAttrs,
  findTransientUiDismissTarget,
  looksLikeTransientUi,
} from './adbUi.ts';
import type { CrawlAdapter, CrawlCouponInput } from '../types.ts';

const SOURCE = 'yogiyo-kr-adb';
const PACKAGE_NAME = 'com.fineapp.yogiyo';
const REMOTE_XML_PATH = '/sdcard/coupon-map-yogiyo-window.xml';
const DEFAULT_WAIT_MS = 1500;
const MAX_SECTION_SWIPES = 8;
const MAX_COUPON_SWIPES = 16;

const NAV_TEXTS = new Set(['홈', '할인/혜택', '주문내역', '찜', '마이요기요']);
const IGNORED_BRAND_TEXTS = new Set([
  '추천',
  '스페셜 적립',
  '브랜드 혜택',
  '이벤트',
  '결제 혜택',
  '쿠폰받기',
]);

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

interface TextNode {
  text: string;
  bounds: Bounds;
  resourceId: string;
  selected: boolean;
}

export interface ParsedYogiyoBrandCoupon {
  brandName: string;
  benefitText: string;
  badges: string[];
  discountAmountKrw: number | null;
  discountPercent: number | null;
  rewardPercent: number | null;
  sourceTexts: string[];
}

export const yogiyoKrAdbAdapter: CrawlAdapter = {
  source: SOURCE,
  async crawl() {
    const adbPath = resolveAdbPath();

    runAdb(adbPath, ['devices']);
    ensurePackageInstalled(adbPath);
    runAdb(adbPath, ['shell', 'am', 'force-stop', PACKAGE_NAME]);

    const launchOutput = runAdb(adbPath, ['shell', 'monkey', '-p', PACKAGE_NAME, '1']);
    if (!launchOutput.includes('Events injected')) {
      throw new Error(`Could not launch Yogiyo app with monkey: ${launchOutput.trim()}`);
    }

    await wait(2500);
    await settleTransientUi(adbPath);
    await ensureDiscountBenefitsTab(adbPath);
    const firstBrandXml = await scrollToBrandBenefitsSection(adbPath);
    const parsedCoupons = await collectBrandCoupons(adbPath, firstBrandXml);

    if (parsedCoupons.length === 0) {
      throw new Error('Yogiyo brand coupon crawl found no coupons in the UI XML.');
    }

    return {
      brand: {
        source: SOURCE,
        external_id: 'yogiyo',
        name: '요기요',
        app_scheme: null,
        store_url: 'https://www.yogiyo.co.kr',
        app_store_url: 'https://play.google.com/store/apps/details?id=com.fineapp.yogiyo',
        iphone_store_url: 'https://apps.apple.com/kr/app/%EB%B0%B0%EB%8B%AC%EC%9A%94%EA%B8%B0%EC%9A%94-%EA%B8%B0%EB%8B%A4%EB%A6%BC-%EC%97%86%EB%8A%94-%EB%A7%9B%EC%A7%91-%EB%B0%B0%EB%8B%AC%EC%95%B1/id543831532',
      },
      stores: [],
      coupons: toCrawlCoupons(parsedCoupons),
    };
  },
};

export function parseYogiyoBrandCouponsFromXml(xml: string): ParsedYogiyoBrandCoupon[] {
  const nodes = extractTextNodes(xml);
  const sectionStartY = findBrandSectionStartY(nodes);
  const couponButtons = nodes.filter(
    (node) => normalizeText(node.text) === '쿠폰받기' && node.bounds.y1 >= sectionStartY
  );
  const coupons: ParsedYogiyoBrandCoupon[] = [];

  for (const button of couponButtons) {
    const benefitNode = findNearestBenefitNode(nodes, button, sectionStartY);
    if (!benefitNode) continue;

    const brandNode = findNearestBrandNode(nodes, benefitNode, sectionStartY);
    if (!brandNode) continue;

    const sourceTexts = uniqueInOrder([
      ...findBadgeNodes(nodes, brandNode).map((node) => node.text),
      brandNode.text,
      benefitNode.text,
      button.text,
    ]);

    coupons.push({
      brandName: brandNode.text,
      benefitText: benefitNode.text,
      badges: sourceTexts.filter((text) => text !== brandNode.text && text !== benefitNode.text && text !== button.text),
      discountAmountKrw: parseDiscountAmountKrw(benefitNode.text),
      discountPercent: parsePercentNearKeyword(benefitNode.text, '할인'),
      rewardPercent: parsePercentNearKeyword(benefitNode.text, '적립'),
      sourceTexts,
    });
  }

  return uniqueCoupons(coupons);
}

async function ensureDiscountBenefitsTab(adbPath: string): Promise<void> {
  const size = getScreenSize(adbPath);

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const xml = dumpUiXml(adbPath);
    throwIfLoginRequired(xml);
    if (await dismissTransientUiIfPresent(adbPath, xml)) continue;
    if (isDiscountBenefitsTab(xml)) return;

    const target =
      findTextNodeCenter(xml, '할인/혜택') ??
      findResourceIdNodeCenter(xml, 'com.fineapp.yogiyo:id/tab_item_2') ?? {
        x: Math.round(size.width * 0.3),
        y: Math.round(size.height * 0.91),
      };
    runAdb(adbPath, ['shell', 'input', 'tap', String(target.x), String(target.y)]);
    await wait(DEFAULT_WAIT_MS);
  }

  throw new Error('Could not navigate to the Yogiyo discount/benefits tab with ADB.');
}

async function scrollToBrandBenefitsSection(adbPath: string): Promise<string> {
  const size = getScreenSize(adbPath);

  for (let attempt = 0; attempt <= MAX_SECTION_SWIPES; attempt += 1) {
    const xml = dumpUiXml(adbPath);
    throwIfLoginRequired(xml);
    if (await dismissTransientUiIfPresent(adbPath, xml)) continue;
    if (isBrandBenefitsSection(xml)) return xml;
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

  throw new Error('Could not find the Yogiyo brand benefits section with ADB.');
}

async function collectBrandCoupons(
  adbPath: string,
  firstXml: string
): Promise<ParsedYogiyoBrandCoupon[]> {
  const size = getScreenSize(adbPath);
  const collected = new Map<string, ParsedYogiyoBrandCoupon>();
  let expectedCount = parseExpectedBrandCount(firstXml);
  let idleAttempts = 0;

  for (let attempt = 0; attempt <= MAX_COUPON_SWIPES; attempt += 1) {
    const xml = attempt === 0 ? firstXml : dumpUiXml(adbPath);
    throwIfLoginRequired(xml);
    if (await dismissTransientUiIfPresent(adbPath, xml)) continue;
    expectedCount ??= parseExpectedBrandCount(xml);

    const beforeCount = collected.size;
    for (const coupon of parseYogiyoBrandCouponsFromXml(xml)) {
      collected.set(couponFingerprint(coupon), coupon);
    }

    idleAttempts = collected.size === beforeCount ? idleAttempts + 1 : 0;
    if (expectedCount !== null && collected.size >= expectedCount) break;
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

async function settleTransientUi(adbPath: string, maxAttempts = 5): Promise<void> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const xml = dumpUiXml(adbPath);
    throwIfLoginRequired(xml);
    if (!(await dismissTransientUiIfPresent(adbPath, xml))) return;
  }
}

async function dismissTransientUiIfPresent(adbPath: string, xml: string): Promise<boolean> {
  if (xml.includes('com_braze_inappmessage_html')) {
    runAdb(adbPath, ['shell', 'input', 'keyevent', 'KEYCODE_BACK']);
    await wait(800);
    return true;
  }

  const target = findTransientUiDismissTarget(xml, {
    dismissTexts: ['닫기', '확인', '나중에', '오늘 하루 보지 않기', '오늘은 그만 보기'],
    transientHintPatterns: [/요기요\s*해피아워/, /특별한\s*혜택/, /쿠폰팩/],
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

function toCrawlCoupons(coupons: ParsedYogiyoBrandCoupon[]): CrawlCouponInput[] {
  return coupons.map((coupon) => {
    const discountAmountKrw = coupon.discountAmountKrw;
    const discountPercent = coupon.discountPercent ?? coupon.rewardPercent;
    const discount_type =
      discountAmountKrw !== null ? '정액' : discountPercent !== null ? '정률' : '세트';
    const discount_value = discountAmountKrw ?? discountPercent ?? 0;

    return {
      external_id: createCouponExternalId(coupon),
      title: `${coupon.brandName} ${coupon.benefitText}`,
      discount_type,
      discount_value,
      valid_until: null,
      raw_payload: {
        source: SOURCE,
        brand_name: coupon.brandName,
        benefit_text: coupon.benefitText,
        badges: coupon.badges,
        discount_amount_krw: coupon.discountAmountKrw,
        discount_percent: coupon.discountPercent,
        reward_percent: coupon.rewardPercent,
        source_texts: coupon.sourceTexts,
      },
    };
  });
}

function extractTextNodes(xml: string): TextNode[] {
  return extractUiNodeAttrs(xml)
    .map((node) => {
      const text = normalizeText(node.text);
      const bounds = parseBounds(node.bounds);
      if (!text || !bounds) return null;
      return {
        text,
        bounds,
        resourceId: node.resourceId,
        selected: node.selected,
      };
    })
    .filter((node): node is TextNode => node !== null)
    .sort((a, b) => a.bounds.y1 - b.bounds.y1 || a.bounds.x1 - b.bounds.x1);
}

function findBrandSectionStartY(nodes: readonly TextNode[]): number {
  const countHeader = nodes.find((node) => /\d+\s*개\s*브랜드\s*할인/.test(node.text));
  if (countHeader) return countHeader.bounds.y2;

  const tab = nodes.find((node) => node.text === '브랜드 혜택');
  if (tab) return tab.bounds.y2;

  return 0;
}

function findNearestBenefitNode(
  nodes: readonly TextNode[],
  button: TextNode,
  sectionStartY: number
): TextNode | null {
  return (
    nodes
      .filter((node) => node.bounds.y1 >= sectionStartY)
      .filter((node) => node.bounds.y2 <= button.bounds.y1)
      .filter((node) => button.bounds.y1 - node.bounds.y2 <= 140)
      .filter((node) => isBenefitText(node.text))
      .sort((a, b) => b.bounds.y1 - a.bounds.y1)[0] ?? null
  );
}

function findNearestBrandNode(
  nodes: readonly TextNode[],
  benefitNode: TextNode,
  sectionStartY: number
): TextNode | null {
  return (
    nodes
      .filter((node) => node.bounds.y1 >= sectionStartY)
      .filter((node) => node.bounds.y2 <= benefitNode.bounds.y1)
      .filter((node) => benefitNode.bounds.y1 - node.bounds.y2 <= 130)
      .filter((node) => isBrandNameText(node.text))
      .sort((a, b) => b.bounds.y1 - a.bounds.y1)[0] ?? null
  );
}

function findBadgeNodes(nodes: readonly TextNode[], brandNode: TextNode): TextNode[] {
  return nodes
    .filter((node) => node.bounds.y2 <= brandNode.bounds.y1)
    .filter((node) => brandNode.bounds.y1 - node.bounds.y2 <= 90)
    .filter((node) => ['추천', '스페셜 적립'].includes(node.text))
    .sort((a, b) => a.bounds.x1 - b.bounds.x1);
}

function isBenefitText(text: string): boolean {
  if (text === '스페셜 적립' || text === '포인트 적립') return false;
  return /(할인|적립|무료배달|무료\s*배달)/.test(text) && /\d|무료/.test(text);
}

function isBrandNameText(text: string): boolean {
  if (NAV_TEXTS.has(text) || IGNORED_BRAND_TEXTS.has(text)) return false;
  if (isBenefitText(text)) return false;
  if (/^\d+$/.test(text) || /^[:：]$/.test(text)) return false;
  if (/^\(?[\d,.]+\)?$/.test(text)) return false;
  if (/(후\s*종료|개\s*브랜드|개\s*가게|배달비|분~|무료~|주소|한강대로)/.test(text)) {
    return false;
  }
  return true;
}

function isDiscountBenefitsTab(xml: string): boolean {
  const nodes = extractTextNodes(xml);
  if (nodes.some((node) => node.text === '할인/혜택' && node.selected)) return true;
  return nodes.some((node) => node.text === '브랜드 혜택' || /\d+\s*개\s*브랜드\s*할인/.test(node.text));
}

function isBrandBenefitsSection(xml: string): boolean {
  const texts = extractTextNodes(xml).map((node) => node.text);
  return (
    texts.includes('브랜드 혜택') ||
    texts.some((text) => /\d+\s*개\s*브랜드\s*할인/.test(text)) ||
    parseYogiyoBrandCouponsFromXml(xml).length > 0
  );
}

function parseExpectedBrandCount(xml: string): number | null {
  for (const node of extractTextNodes(xml)) {
    const match = node.text.match(/(\d+)\s*개\s*브랜드\s*할인/);
    if (match) return Number(match[1]);
  }
  return null;
}

function parseDiscountAmountKrw(text: string): number | null {
  const amountMatches = [
    ...text.matchAll(/(\d{1,3}(?:,\d{3})+|\d+)\s*원\s*할인/g),
  ].map((match) => Number(match[1].replaceAll(',', '')));
  const manWonMatches = [...text.matchAll(/(\d+(?:\.\d+)?)\s*만\s*원\s*할인/g)].map(
    (match) => Math.round(Number(match[1]) * 10000)
  );
  const cheonWonMatches = [...text.matchAll(/(\d+(?:\.\d+)?)\s*천\s*원\s*할인/g)].map(
    (match) => Math.round(Number(match[1]) * 1000)
  );
  const amounts = [...amountMatches, ...manWonMatches, ...cheonWonMatches].filter((value) =>
    Number.isFinite(value)
  );
  return amounts.length > 0 ? Math.max(...amounts) : null;
}

function parsePercentNearKeyword(text: string, keyword: '할인' | '적립'): number | null {
  const matches = [...text.matchAll(/(\d+(?:\.\d+)?)\s*%/g)];
  for (const match of matches) {
    const tail = text.slice(match.index ?? 0, (match.index ?? 0) + 12);
    if (tail.includes(keyword)) return Number(match[1]);
  }
  return null;
}

function couponFingerprint(coupon: ParsedYogiyoBrandCoupon): string {
  return `${coupon.brandName}|${coupon.benefitText}`;
}

function uniqueCoupons(coupons: readonly ParsedYogiyoBrandCoupon[]): ParsedYogiyoBrandCoupon[] {
  const seen = new Set<string>();
  const result: ParsedYogiyoBrandCoupon[] = [];

  for (const coupon of coupons) {
    const fingerprint = couponFingerprint(coupon);
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    result.push(coupon);
  }

  return result;
}

function createCouponExternalId(coupon: ParsedYogiyoBrandCoupon): string {
  const hash = createHash('sha256')
    .update(couponFingerprint(coupon), 'utf8')
    .digest('hex')
    .slice(0, 16);
  return `yogiyo-brand-${hash}`;
}

function findTextNodeCenter(xml: string, text: string): Point | null {
  for (const node of extractUiNodeAttrs(xml)) {
    if (normalizeText(node.text) !== text) continue;
    const bounds = parseBounds(node.bounds);
    if (!bounds) continue;
    return center(bounds);
  }
  return null;
}

function findResourceIdNodeCenter(xml: string, resourceId: string): Point | null {
  for (const node of extractUiNodeAttrs(xml)) {
    if (node.resourceId !== resourceId) continue;
    const bounds = parseBounds(node.bounds);
    if (!bounds) continue;
    return center(bounds);
  }
  return null;
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
    throw new Error(`Yogiyo app is not installed on the selected device: ${PACKAGE_NAME}`);
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
  const texts = extractTextNodes(xml).map((node) => node.text);
  const loginHint = texts.find((text) => /로그인|카카오|휴대폰\s*번호/.test(text));
  if (loginHint) {
    throw new Error(`Yogiyo brand coupon crawl requires an authenticated app session (${loginHint}).`);
  }
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function uniqueInOrder(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
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
