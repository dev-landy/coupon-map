import { describe, expect, it } from 'vitest';

import { parseYogiyoBrandCouponsFromXml } from '../lib/ingest/adapters/yogiyoKrAdb';

describe('parseYogiyoBrandCouponsFromXml', () => {
  it('extracts Yogiyo brand benefit coupon cards and ignores nearby store cards', () => {
    const xml = `
      <hierarchy>
        <node text="무료배달 + 최대 3% 적립" class="android.widget.TextView" bounds="[615,429][999,481]" />
        <node text="다복향마라탕-남영직영점" class="android.widget.TextView" bounds="[654,506][1026,570]" />
        <node text="브랜드 혜택" class="android.widget.TextView" bounds="[93,859][331,928]" />
        <node text="이벤트" class="android.widget.TextView" bounds="[473,859][608,928]" />
        <node text="결제 혜택" class="android.widget.TextView" bounds="[772,859][965,928]" />
        <node text="27개 브랜드 할인&amp;적립 중!" class="android.widget.TextView" bounds="[48,1025][712,1110]" />
        <node text="스페셜 적립" class="android.widget.TextView" bounds="[378,1164][515,1204]" />
        <node text="추천" class="android.widget.TextView" bounds="[563,1164][615,1204]" />
        <node text="인생아구찜" class="android.widget.TextView" bounds="[318,1229][518,1290]" />
        <node text="최대 6,000원 할인 + 최대 8% 적립" class="android.widget.TextView" bounds="[318,1302][1030,1371]" />
        <node text="쿠폰받기" class="android.widget.TextView" bounds="[384,1393][520,1445]" />
        <node text="파바픽업" class="android.widget.TextView" bounds="[318,1558][478,1619]" />
        <node text="최대 6,000원 할인 + 최대 3% 적립" class="android.widget.TextView" bounds="[318,1631][1030,1700]" />
        <node text="쿠폰받기" class="android.widget.TextView" bounds="[384,1722][520,1774]" />
        <node text="홈" resource-id="android:id/text1" class="android.widget.TextView" selected="false" bounds="[94,2133][122,2179]" />
        <node text="할인/혜택" resource-id="android:id/text1" class="android.widget.TextView" selected="true" bounds="[261,2133][387,2179]" />
      </hierarchy>
    `;

    expect(parseYogiyoBrandCouponsFromXml(xml)).toEqual([
      {
        brandName: '인생아구찜',
        benefitText: '최대 6,000원 할인 + 최대 8% 적립',
        badges: ['스페셜 적립', '추천'],
        discountAmountKrw: 6000,
        discountPercent: null,
        rewardPercent: 8,
        sourceTexts: [
          '스페셜 적립',
          '추천',
          '인생아구찜',
          '최대 6,000원 할인 + 최대 8% 적립',
          '쿠폰받기',
        ],
      },
      {
        brandName: '파바픽업',
        benefitText: '최대 6,000원 할인 + 최대 3% 적립',
        badges: [],
        discountAmountKrw: 6000,
        discountPercent: null,
        rewardPercent: 3,
        sourceTexts: ['파바픽업', '최대 6,000원 할인 + 최대 3% 적립', '쿠폰받기'],
      },
    ]);
  });

  it('supports percent-only brand benefits', () => {
    const xml = `
      <hierarchy>
        <node text="브랜드 혜택" class="android.widget.TextView" bounds="[93,100][331,180]" />
        <node text="추천브랜드" class="android.widget.TextView" bounds="[318,320][518,380]" />
        <node text="최대 15% 할인" class="android.widget.TextView" bounds="[318,390][1030,460]" />
        <node text="쿠폰받기" class="android.widget.TextView" bounds="[384,482][520,534]" />
      </hierarchy>
    `;

    expect(parseYogiyoBrandCouponsFromXml(xml)).toEqual([
      expect.objectContaining({
        brandName: '추천브랜드',
        benefitText: '최대 15% 할인',
        discountAmountKrw: null,
        discountPercent: 15,
        rewardPercent: null,
      }),
    ]);
  });
});
