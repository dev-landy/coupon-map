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
});
