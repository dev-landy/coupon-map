import { describe, expect, it } from 'vitest';

import { parseMcdonaldsCouponsFromXml } from '../lib/ingest/adapters/mcdonaldsKrAdb';

describe('parseMcdonaldsCouponsFromXml', () => {
  it('extracts coupon title, validity, prices, and percent discount', () => {
    const xml = `
      <hierarchy>
        <node text="쿠폰" class="android.widget.Button" bounds="[200,2100][400,2300]" />
        <node text="빅맥 세트 30% 할인" class="android.widget.TextView" bounds="[40,500][900,560]" />
        <node text="2026.06.30까지" class="android.widget.TextView" bounds="[40,570][900,620]" />
        <node text="8,900원" class="android.widget.TextView" bounds="[40,650][200,700]" />
        <node text="6,200원" class="android.widget.TextView" bounds="[220,650][420,700]" />
        <node text="30% 할인" class="android.widget.TextView" bounds="[40,720][240,780]" />
      </hierarchy>
    `;

    expect(parseMcdonaldsCouponsFromXml(xml)).toEqual([
      expect.objectContaining({
        title: '빅맥 세트 30% 할인',
        validUntil: '2026-06-30',
        originalPriceKrw: 8900,
        couponPriceKrw: 6200,
        discountPercent: 30,
      }),
    ]);
  });

  it('extracts live McDonald’s deal cards from content descriptions', () => {
    const xml = `
      <hierarchy>
        <node text="" content-desc="쿠폰" resource-id="DealsScreen/SectionHeader/HeadlineBase " class="android.view.View" bounds="[72,595][200,694]" />
        <node text="사용 가능한 쿠폰" resource-id="DealsScreen/0/Pill/TextSmallRegular " class="android.widget.TextView" bounds="[120,776][374,828]" />
        <node text="" content-desc="" resource-id="DealsScreen/DealCard/McCard " class="android.view.View" clickable="true" bounds="[72,910][1008,1622]">
          <node text="" content-desc="맥윙™ 2조각+탄산 음료 M 3300원" resource-id="DealsScreen/DealCard/HeadlineBase " class="android.view.View" bounds="[120,1426][960,1498]" />
          <node text="유효기간 2026-06-08" content-desc="" resource-id="DealsScreen/DealCard/TextSmallRegular " class="android.widget.TextView" bounds="[120,1522][466,1574]" />
        </node>
        <node text="" content-desc="" resource-id="DealsScreen/DealCard/McCard " class="android.view.View" clickable="true" bounds="[72,1694][1008,2310]">
          <node text="" content-desc="[-20%] 맥앤치즈 스파이시 치킨+탄산 음료 M" resource-id="DealsScreen/DealCard/HeadlineBase " class="android.view.View" bounds="[120,2050][960,2122]" />
          <node text="유효기간 2026-06-08" content-desc="" resource-id="DealsScreen/DealCard/TextSmallRegular " class="android.widget.TextView" bounds="[120,2146][466,2198]" />
        </node>
      </hierarchy>
    `;

    expect(parseMcdonaldsCouponsFromXml(xml)).toEqual([
      expect.objectContaining({
        title: '맥윙™ 2조각+탄산 음료 M 3300원',
        validUntil: '2026-06-08',
        originalPriceKrw: null,
        couponPriceKrw: 3300,
        discountPercent: null,
      }),
      expect.objectContaining({
        title: '[-20%] 맥앤치즈 스파이시 치킨+탄산 음료 M',
        validUntil: '2026-06-08',
        originalPriceKrw: null,
        couponPriceKrw: null,
        discountPercent: 20,
      }),
    ]);
  });
});
