import {
  createGenericAdbCouponAdapter,
  parseGenericCouponsFromXml,
} from './genericAdbCoupon.ts';

const config = {
  source: 'mcdonalds-kr-adb',
  packageName: 'com.mcdonalds.mobileapp',
  brand: {
    external_id: 'mcdonalds',
    name: '맥도날드',
    app_scheme: 'mcdonaldskr://',
    store_url: 'https://www.mcdonalds.co.kr',
    app_store_url: 'https://play.google.com/store/apps/details?id=com.mcdonalds.mobileapp',
  },
  couponButtonTexts: ['쿠폰', '쿠폰함', '이달의 쿠폰', 'My 쿠폰', 'MY 쿠폰'],
  ignoredTexts: ['맥도날드', 'McDonald’s', 'McDonalds', '홈', '주문', '마이페이지'],
};

export const mcdonaldsKrAdbAdapter = createGenericAdbCouponAdapter(config);

export function parseMcdonaldsCouponsFromXml(xml: string) {
  return parseGenericCouponsFromXml(xml, config);
}
