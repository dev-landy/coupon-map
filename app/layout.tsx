import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: '쿠폰맵',
  description: '내 주변 프랜차이즈 할인 쿠폰을 찾아주는 지도 앱',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
