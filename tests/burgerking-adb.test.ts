import { describe, expect, it } from 'vitest';

import {
  parseBurgerKingCouponDetailFromTexts,
  parseBurgerKingCouponDetailFromXml,
  parseBurgerKingCouponsFromXml,
} from '../lib/ingest/adapters/burgerkingKrAdb';

describe('parseBurgerKingCouponsFromXml', () => {
  it('extracts Burger King coupon card data from uiautomator XML', () => {
    const xml = `
      <hierarchy>
        <node index="0" text="" class="android.view.View" content-desc="" bounds="">
          <node index="0" text="" class="android.view.View" content-desc="" bounds="">
            <node index="0" text="" class="android.view.View" content-desc="" bounds="">
              <node index="0" text="ico_member_king" class="android.widget.Image" content-desc="King 등급 쿠폰" bounds="" />
              <node index="1" text="위클리" class="android.view.View" content-desc="" bounds="" />
              <node index="2" text="HOT" class="android.view.View" content-desc="" bounds="" />
              <node index="3" text="a962f5ae-54d8-43a0-aa06-66a450da4828" class="android.widget.Image" content-desc="제품 이미지" bounds="" />
              <node index="4" text="[신제품] 오리지널스 엘파소 치폴레 세트" class="android.widget.TextView" content-desc="" bounds="" />
              <node index="5" text="2026.06.07 까지" class="android.widget.TextView" content-desc="" bounds="" />
              <node index="6" text="13,100원" class="android.widget.TextView" content-desc="" bounds="" />
              <node index="7" text="11,800원" class="android.widget.TextView" content-desc="" bounds="" />
              <node index="8" text="9% 할인" class="android.widget.TextView" content-desc="" bounds="" />
              <node index="9" text="선택하기" class="android.view.View" content-desc="" bounds="" />
            </node>
            <node index="1" text="coupon detail" class="android.widget.Button" content-desc="" bounds="" />
          </node>
        </node>
      </hierarchy>
    `;

    const coupons = parseBurgerKingCouponsFromXml(xml);

    expect(coupons).toEqual([
      expect.objectContaining({
        title: '[신제품] 오리지널스 엘파소 치폴레 세트',
        validUntil: '2026-06-07',
        imageId: 'a962f5ae-54d8-43a0-aa06-66a450da4828',
        categories: ['위클리', 'HOT'],
        originalPriceKrw: 13100,
        couponPriceKrw: 11800,
        discountPercent: 9,
      }),
    ]);
  });
});

describe('parseBurgerKingCouponDetailFromTexts', () => {
  it('extracts live Burger King detail labels from OCR text', () => {
    const detail = parseBurgerKingCouponDetailFromTexts([
      '쿠폰',
      '4073352885336064',
      '콰트로치즈와퍼 세트',
      '쿠폰정보',
      '쿠폰명',
      '위클리 쿠폰',
      '유효기간',
      '2026년 06월 07일까지',
      '주문방법',
      '매장 / 킹오더',
      '제품금액',
      '10,400 원',
      '할인금액',
      '할인 1,300원',
      '결제금액',
      '9,100 원',
      '주문하기',
    ]);

    expect(detail).toEqual(
      expect.objectContaining({
        title: '콰트로치즈와퍼 세트',
        couponKind: '위클리',
        isWeeklyCoupon: true,
        validUntil: '2026-06-07',
        validPeriodText: '2026년 06월 07일까지',
        orderMethods: ['킹오더', '매장'],
        productPriceKrw: 10400,
        discountAmountKrw: 1300,
        paymentAmountKrw: 9100,
        appLink: null,
      })
    );
  });

  it('ignores selectable discount modals that are not coupon detail screens', () => {
    const detail = parseBurgerKingCouponDetailFromTexts([
      '마이팩 할인 쿠폰 선택하기',
      '원하는 할인 금액을 선택하여 혜택 받아보세요!',
      '10,000원 이상 주문시',
      '2,000원 즉시 할인 쿠폰',
      '7,000원 이상 주문시',
      '1,000원 즉시 할인 쿠폰',
      '선택',
    ]);

    expect(detail).toBeNull();
  });
});

describe('parseBurgerKingCouponDetailFromXml', () => {
  it('returns null when uiautomator only exposes the WebView shell', () => {
    const xml = `
      <hierarchy>
        <node index="0" text="" class="android.widget.FrameLayout" bounds="[0,0][1080,2424]">
          <node index="0" text="" class="android.webkit.WebView" bounds="[0,0][1080,2361]" />
        </node>
      </hierarchy>
    `;

    expect(parseBurgerKingCouponDetailFromXml(xml)).toBeNull();
  });
});
