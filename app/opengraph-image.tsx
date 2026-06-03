import { ImageResponse } from 'next/og';

import { SITE_TITLE } from '../lib/seo';

export const alt = SITE_TITLE;
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: '100%',
          padding: 72,
          background: '#f7f3ea',
          color: '#171717',
          fontFamily: 'Arial, sans-serif',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
          }}
        >
          <svg width="1200" height="630" viewBox="0 0 1200 630" fill="none">
            <rect width="1200" height="630" fill="#f7f3ea" />
            <path d="M-80 160H1280" stroke="#ffffff" strokeWidth="42" />
            <path d="M-80 428H1280" stroke="#ffffff" strokeWidth="36" />
            <path d="M320 -80V720" stroke="#ffffff" strokeWidth="38" />
            <path d="M850 -80V720" stroke="#ffffff" strokeWidth="42" />
            <path
              d="M-80 560C130 430 265 330 420 210C610 63 800 40 1280 80"
              stroke="#bbd89a"
              strokeWidth="54"
              strokeLinecap="round"
            />
            <path
              d="M-80 560C130 430 265 330 420 210C610 63 800 40 1280 80"
              stroke="#1f9d55"
              strokeWidth="8"
              strokeLinecap="round"
            />
            <circle cx="424" cy="208" r="22" fill="#ffffff" stroke="#1f9d55" strokeWidth="8" />
            <circle cx="815" cy="68" r="22" fill="#ffffff" stroke="#1f9d55" strokeWidth="8" />
            <rect x="82" y="62" width="164" height="90" rx="8" fill="#e8e1d2" />
            <rect x="525" y="356" width="178" height="106" rx="8" fill="#e8e1d2" />
            <rect x="930" y="372" width="178" height="102" rx="8" fill="#e8e1d2" />
          </svg>
        </div>

        <div
          style={{
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            width: '100%',
            border: '1px solid rgba(23,23,23,.08)',
            borderRadius: 8,
            padding: 48,
            background: 'rgba(255,255,255,.84)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 64,
                height: 64,
                borderRadius: 8,
                background: '#f5402c',
                color: '#ffffff',
                fontSize: 30,
                fontWeight: 900,
              }}
            >
              C
            </div>
            <div style={{ display: 'flex', fontSize: 32, fontWeight: 900 }}>CouponMap</div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 820 }}>
            <div style={{ display: 'flex', fontSize: 76, fontWeight: 900, lineHeight: 1.05 }}>
              Nearby coupon map
            </div>
            <div style={{ display: 'flex', color: '#4d4d55', fontSize: 30, lineHeight: 1.35 }}>
              Find franchise discounts and valid coupons around you.
            </div>
          </div>
        </div>
      </div>
    ),
    size
  );
}
