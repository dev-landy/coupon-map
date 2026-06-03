import { describe, expect, it } from 'vitest';

import { parseKfcCouponsFromXml } from '../lib/ingest/adapters/kfcKrAdb';

describe('parseKfcCouponsFromXml', () => {
  it('extracts coupon card text from KFC-style XML', () => {
    const xml = `
      <hierarchy>
        <node text="MY 쿠폰" class="android.widget.Button" bounds="[200,2100][400,2300]" />
        <node text="징거버거 세트 쿠폰" class="android.widget.TextView" bounds="[40,500][900,560]" />
        <node text="2026-06-30 까지" class="android.widget.TextView" bounds="[40,570][900,620]" />
        <node text="9,800원" class="android.widget.TextView" bounds="[40,650][200,700]" />
        <node text="7,900원" class="android.widget.TextView" bounds="[220,650][420,700]" />
        <node text="19% 할인" class="android.widget.TextView" bounds="[40,720][240,780]" />
      </hierarchy>
    `;

    expect(parseKfcCouponsFromXml(xml)).toEqual([
      expect.objectContaining({
        title: '징거버거 세트 쿠폰',
        validUntil: '2026-06-30',
        originalPriceKrw: 9800,
        couponPriceKrw: 7900,
        discountPercent: 19,
      }),
    ]);
  });

  it('extracts prices and detail payload fields from live KFC MY coupon cards', () => {
    const xml = `
      <hierarchy>
        <node text="MY쿠폰" class="android.widget.TextView" bounds="[147,195][933,237]" />
        <node text="" content-desc="매장 방문" class="android.widget.LinearLayout" clickable="false" bounds="[0,289][270,415]" />
        <node text="매장 방문" class="android.widget.TextView" bounds="[43,317][227,386]" />
        <node text="" content-desc="딜리버리" class="android.widget.LinearLayout" clickable="true" bounds="[270,289][540,415]" />
        <node text="딜리버리" class="android.widget.TextView" bounds="[319,317][491,386]" />
        <node text="쿠폰 모두 받기" class="android.widget.Button" bounds="[42,457][1038,583]" />
        <node text="[NEW] 오리지널통다리(3+2) 17,800원→10,900원" class="android.widget.TextView" bounds="[375,699][808,812]" />
        <node text="39% 할인" class="android.widget.TextView" bounds="[375,838][808,909]" />
        <node text="2026/06/15 까지" class="android.widget.TextView" bounds="[375,935][808,977]" />
      </hierarchy>
    `;

    expect(parseKfcCouponsFromXml(xml)).toEqual([
      expect.objectContaining({
        title: '[NEW] 오리지널통다리(3+2)',
        validUntil: '2026-06-15',
        originalPriceKrw: 17800,
        couponPriceKrw: 10900,
        discountPercent: 39,
        detail: expect.objectContaining({
          couponKind: 'NEW',
          isWeeklyCoupon: false,
          validUntil: '2026-06-15',
          orderMethods: ['매장 방문'],
          productPriceKrw: 17800,
          discountAmountKrw: 6900,
          paymentAmountKrw: 10900,
          appLink: null,
        }),
      }),
    ]);
  });
});
