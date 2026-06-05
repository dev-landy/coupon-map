/**
 * UI view-model data for the screens, ported from the Claude Design mockup.
 *
 * This is the DEMO data that makes the screens render exactly like the design.
 * It is intentionally separate from the database types in `types.ts`:
 *  - markers carry a precomputed "최대 할인" (marker.value/unit) for the map pin,
 *  - coupons use the UI discount kinds rate/amount/set/bogo (bogo = 1+1, which
 *    has no DB DiscountType yet — see TODOS.md),
 *  - x/y are pixel positions on the placeholder SVG map (to be replaced by the
 *    Kakao Maps SDK with real lat/lng).
 *
 * When Supabase wiring lands, replace STORES with data fetched via lib/stores.ts
 * + lib/coupons.ts and adapt DiscountType → UiCouponKind.
 */

import type { Brand } from './types';

export type UiCouponKind = 'rate' | 'amount' | 'set' | 'bogo';

export interface UiBrand {
  id: string;
  name: string;
  short: string;
  bg: string;
  fg: string;
  initial: string;
  /**
   * Deep-link fields. PLACEHOLDERS — schemes/URLs are unverified guesses.
   * TODOS.md item #1 is to verify these against the real apps before launch.
   */
  app_scheme: string | null;
  store_url: string;
  app_store_url: string | null;
  iphone_store_url: string | null;
}

export interface UiCoupon {
  id: string;
  name: string;
  kind: UiCouponKind;
  /** Big discount text shown in the accent block, e.g. '30%', '4,900원', '1+1'. */
  headline: string;
  sub: string;
  /** D-day style validity label, e.g. 'D-4'. */
  until: string;
  cond: string;
  /** Discount attractiveness for sorting (higher = better). */
  rank: number;
}

export interface UiStore {
  id: string;
  brandId: string;
  branch: string;
  address: string;
  dist: number;
  x: number;
  y: number;
  open: boolean;
  hours: string;
  marker: { unit: string; value: string };
  coupons: UiCoupon[];
}

export const BRANDS: Record<string, UiBrand> = {
  mcdonalds: { id: 'mcdonalds', name: '맥도날드', short: '맥도날드', bg: '#DA291C', fg: '#FFC72C', initial: 'M', app_scheme: 'https://links.mcdonaldsapps.com/', store_url: 'https://www.mcdonalds.co.kr', app_store_url: null, iphone_store_url: 'https://apps.apple.com/kr/app/id1255284387' },
  burgerking: { id: 'burgerking', name: '버거킹', short: '버거킹', bg: '#3A2317', fg: '#F5A623', initial: 'BK', app_scheme: 'burgerking://main', store_url: 'https://www.burgerking.co.kr', app_store_url: null, iphone_store_url: 'https://apps.apple.com/kr/app/id1364917496' },
  lotteria: { id: 'lotteria', name: '롯데리아', short: '롯데리아', bg: '#E51937', fg: '#FFFFFF', initial: 'L', app_scheme: 'lotteeatz://', store_url: 'https://www.lotteeatz.com', app_store_url: null, iphone_store_url: null },
  momstouch: { id: 'momstouch', name: '맘스터치', short: '맘스터치', bg: '#1A1A1E', fg: '#FFD400', initial: '맘', app_scheme: null, store_url: 'https://www.momstouch.co.kr', app_store_url: null, iphone_store_url: null },
  subway: { id: 'subway', name: '써브웨이', short: '써브웨이', bg: '#006E33', fg: '#FFC600', initial: 'S', app_scheme: null, store_url: 'https://www.subway.co.kr', app_store_url: null, iphone_store_url: null },
  bbq: { id: 'bbq', name: 'BBQ', short: 'BBQ', bg: '#C8102E', fg: '#FFD200', initial: 'BBQ', app_scheme: null, store_url: 'https://www.bbq.co.kr', app_store_url: null, iphone_store_url: null },
  kyochon: { id: 'kyochon', name: '교촌치킨', short: '교촌', bg: '#E60012', fg: '#FFFFFF', initial: '교촌', app_scheme: null, store_url: 'https://www.kyochon.com', app_store_url: null, iphone_store_url: null },
  bhc: { id: 'bhc', name: 'bhc치킨', short: 'bhc', bg: '#ED1A22', fg: '#FFFFFF', initial: 'bhc', app_scheme: null, store_url: 'https://www.bhc.co.kr', app_store_url: null, iphone_store_url: null },
};

/** Adapt a UiBrand to the deeplink-facing Brand shape from types.ts. */
export function toBrand(ui: UiBrand): Brand {
  return {
    id: ui.id,
    name: ui.name,
    app_scheme: ui.app_scheme,
    store_url: ui.store_url,
    app_store_url: ui.app_store_url,
    iphone_store_url: ui.iphone_store_url,
  };
}

export const STORES: UiStore[] = [
  {
    id: 'mc-hongik', brandId: 'mcdonalds', branch: '홍익대점', address: '서울 마포구 양화로 160',
    dist: 180, x: 150, y: 250, open: true, hours: '24시간', marker: { unit: '%', value: '30' },
    coupons: [
      { id: 'c1', name: '빅맥 세트', kind: 'rate', headline: '30%', sub: '세트 메뉴 30% 할인', until: 'D-4', cond: '매장·배달 모두 가능', rank: 30 },
      { id: 'c2', name: '맥스파이시 상하이', kind: 'amount', headline: '2,000원', sub: '단품 2,000원 할인', until: 'D-9', cond: '1인 1회', rank: 20 },
      { id: 'c3', name: '아메리카노', kind: 'bogo', headline: '1+1', sub: '맥카페 아메리카노 1+1', until: 'D-2', cond: '오후 2시 이후', rank: 18 },
    ],
  },
  {
    id: 'bk-hongdae', brandId: 'burgerking', branch: '홍대입구역점', address: '서울 마포구 양화로 188',
    dist: 230, x: 250, y: 196, open: true, hours: '10:00–24:00', marker: { unit: '원', value: '4,900' },
    coupons: [
      { id: 'c1', name: '와퍼 세트', kind: 'amount', headline: '4,900원', sub: '와퍼 단품 특가', until: 'D-6', cond: '1일 1회', rank: 28 },
      { id: 'c2', name: '통새우와퍼 세트', kind: 'rate', headline: '25%', sub: '세트 25% 할인', until: 'D-11', cond: '매장 픽업', rank: 25 },
    ],
  },
  {
    id: 'lt-sinchon', brandId: 'lotteria', branch: '신촌점', address: '서울 서대문구 신촌로 83',
    dist: 540, x: 92, y: 150, open: true, hours: '09:00–02:00', marker: { unit: '원', value: '2,000' },
    coupons: [
      { id: 'c1', name: '불고기버거 세트', kind: 'amount', headline: '2,000원', sub: '세트 2,000원 할인', until: 'D-8', cond: '평일 한정', rank: 20 },
      { id: 'c2', name: '치즈스틱 4조각', kind: 'bogo', headline: '1+1', sub: '치즈스틱 1+1', until: 'D-15', cond: '배달 가능', rank: 16 },
    ],
  },
  {
    id: 'mt-hongdae', brandId: 'momstouch', branch: '홍대점', address: '서울 마포구 어울마당로 35',
    dist: 310, x: 198, y: 320, open: true, hours: '10:30–24:00', marker: { unit: '%', value: '20' },
    coupons: [
      { id: 'c1', name: '싸이버거 세트', kind: 'rate', headline: '20%', sub: '세트 20% 할인', until: 'D-5', cond: '앱 주문', rank: 22 },
      { id: 'c2', name: '후라이드 싱글', kind: 'amount', headline: '1,500원', sub: '단품 1,500원 할인', until: 'D-12', cond: '매장 픽업', rank: 14 },
    ],
  },
  {
    id: 'sub-hongik', brandId: 'subway', branch: '홍대정문점', address: '서울 마포구 와우산로 94',
    dist: 420, x: 116, y: 372, open: false, hours: '08:00–22:00', marker: { unit: '%', value: '15' },
    coupons: [
      { id: 'c1', name: '15cm 클래식', kind: 'rate', headline: '15%', sub: '샌드위치 15% 할인', until: 'D-20', cond: '에그마요 외', rank: 15 },
    ],
  },
  {
    id: 'bbq-yeonnam', brandId: 'bbq', branch: '연남점', address: '서울 마포구 동교로 246',
    dist: 650, x: 286, y: 268, open: true, hours: '11:00–01:00', marker: { unit: '원', value: '5,000' },
    coupons: [
      { id: 'c1', name: '황금올리브 + 콜라', kind: 'set', headline: '세트가', sub: '세트 5,000원 할인', until: 'D-7', cond: '2만원 이상', rank: 26 },
      { id: 'c2', name: '자메이카 통다리', kind: 'amount', headline: '3,000원', sub: '3,000원 할인', until: 'D-13', cond: '배달·픽업', rank: 19 },
    ],
  },
  {
    id: 'kyochon-hongdae', brandId: 'kyochon', branch: '홍대점', address: '서울 마포구 홍익로 6',
    dist: 480, x: 300, y: 360, open: true, hours: '12:00–24:00', marker: { unit: '원', value: '3,000' },
    coupons: [
      { id: 'c1', name: '허니콤보', kind: 'amount', headline: '3,000원', sub: '3,000원 할인', until: 'D-9', cond: '앱 주문', rank: 21 },
      { id: 'c2', name: '레드콤보', kind: 'amount', headline: '2,000원', sub: '2,000원 할인', until: 'D-13', cond: '매장 픽업', rank: 17 },
    ],
  },
];

export type SortKey = 'near' | 'deal';

export function sortedStores(by: SortKey = 'near'): UiStore[] {
  const arr = [...STORES];
  if (by === 'near') return arr.sort((a, b) => a.dist - b.dist);
  return arr.sort((a, b) => b.coupons[0].rank - a.coupons[0].rank);
}
