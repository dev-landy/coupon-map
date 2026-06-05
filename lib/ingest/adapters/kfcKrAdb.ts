import {
  createGenericAdbCouponAdapter,
  parseGenericCouponsFromXml,
} from './genericAdbCoupon.ts';

const config = {
  source: 'kfc-kr-adb',
  packageName: 'kfc_ko.kore.kg.kfc_korea',
  brand: {
    external_id: 'kfc',
    name: 'KFC',
    app_scheme: 'kfcremaster://main',
    store_url: 'https://www.kfckorea.com',
    app_store_url: 'https://play.google.com/store/apps/details?id=kfc_ko.kore.kg.kfc_korea',
    iphone_store_url: 'https://apps.apple.com/kr/app/kfc-korea/id1255799839',
  },
  couponButtonTexts: ['쿠폰', '쿠폰함', 'E쿠폰', 'e쿠폰', 'MY쿠폰', 'MY 쿠폰'],
  couponScreenTexts: ['MY쿠폰', '쿠폰 모두 받기'],
  loginRequiredTexts: ['Login with Kakao Account', 'kauth.kakao.com'],
  orderMethodTexts: ['매장 방문', '딜리버리', '징거벨 오더'],
  defaultOrderMethods: ['매장 방문'],
  ignoredTexts: ['KFC', '홈', '주문', '마이페이지', '이벤트', '쿠폰 모두 받기'],
};

export const kfcKrAdbAdapter = createGenericAdbCouponAdapter(config);

export function parseKfcCouponsFromXml(xml: string) {
  return parseGenericCouponsFromXml(xml, config);
}
