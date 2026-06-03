import { describe, expect, it } from 'vitest';

import {
  findTransientUiDismissTarget,
  looksLikeTransientUi,
} from '../lib/ingest/adapters/adbUi';

describe('ADB transient UI helpers', () => {
  it('prioritizes permission allow buttons', () => {
    const xml = `
      <hierarchy>
        <node text="위치 권한이 필요합니다" class="android.widget.TextView" package="com.android.permissioncontroller" bounds="[80,900][1000,980]" />
        <node text="허용 안 함" class="android.widget.Button" package="com.android.permissioncontroller" clickable="true" bounds="[80,1800][480,1900]" />
        <node text="앱 사용 중에만 허용" class="android.widget.Button" package="com.android.permissioncontroller" clickable="true" bounds="[520,1800][1000,1900]" />
      </hierarchy>
    `;

    expect(findTransientUiDismissTarget(xml)).toEqual(
      expect.objectContaining({
        label: '앱 사용 중에만 허용',
        point: { x: 760, y: 1850 },
      })
    );
  });

  it('checks do-not-show controls before closing campaign popups', () => {
    const xml = `
      <hierarchy>
        <node text="오늘 하루 보지 않기" class="android.widget.TextView" clickable="true" bounds="[64,1860][520,1940]" />
        <node text="" content-desc="닫기" class="android.widget.ImageButton" clickable="true" bounds="[980,120][1040,180]" />
      </hierarchy>
    `;

    expect(findTransientUiDismissTarget(xml)).toEqual(
      expect.objectContaining({
        label: '오늘 하루 보지 않기',
        point: { x: 292, y: 1900 },
      })
    );
  });

  it('detects strong transient UI hints even without an explicit close button', () => {
    const xml = `
      <hierarchy>
        <node text="업데이트 안내" class="android.widget.TextView" bounds="[80,600][1000,680]" />
      </hierarchy>
    `;

    expect(looksLikeTransientUi(xml)).toBe(true);
  });

  it('does not treat regular coupon navigation as a dismiss target', () => {
    const xml = `
      <hierarchy>
        <node text="홈" class="android.widget.Button" clickable="true" bounds="[0,2100][270,2320]" />
        <node text="쿠폰" class="android.widget.Button" clickable="true" bounds="[270,2100][540,2320]" />
      </hierarchy>
    `;

    expect(findTransientUiDismissTarget(xml)).toBeNull();
    expect(looksLikeTransientUi(xml)).toBe(false);
  });
});

