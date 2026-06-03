/**
 * Design tokens for 쿠폰맵, ported from the Claude Design handoff.
 *
 * Single accent (#F5402C) is reserved for discount emphasis and the primary
 * "use in app" CTA only — never decoration. Visual hierarchy across the app:
 * 할인(accent) > 거리(bold ink) > 브랜드 > 부가정보.
 */

import type { CSSProperties } from 'react';

export const T = {
  ink: '#15151A',
  ink2: '#5B5B63',
  ink3: '#9A9AA2',
  line: '#ECECEF',
  surface: '#F7F7F5',
  bg: '#FFFFFF',
  accent: '#F5402C', // 딜 컬러 — 할인 강조 전용
  accentPress: '#D8311F',
  accentTint: '#FFF1EE',
  green: '#119C5B',
  font: "'Pretendard Variable', Pretendard, -apple-system, system-ui, sans-serif",
} as const;

/** tabular figures so discount/distance numbers stay aligned and scannable. */
export const numStyle: CSSProperties = {
  fontVariantNumeric: 'tabular-nums',
  fontFeatureSettings: '"tnum" 1',
};
