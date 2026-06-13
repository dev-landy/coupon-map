import type { Metadata, Viewport } from 'next';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';

import { AmplitudeInitializer } from './AmplitudeInitializer';
import { styles as couponMapStyles } from './coupon-map/styles';
import {
  SITE_DESCRIPTION,
  SITE_ICON,
  SITE_IMAGE_ALT,
  SITE_LOCALE,
  SITE_NAME,
  SITE_OG_IMAGE,
  SITE_OG_IMAGE_HEIGHT,
  SITE_OG_IMAGE_WIDTH,
  SITE_TITLE,
  getSiteUrl,
} from '../lib/seo';

export const metadata: Metadata = {
  metadataBase: getSiteUrl(),
  applicationName: SITE_NAME,
  title: {
    default: SITE_TITLE,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  authors: [{ name: SITE_NAME }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  category: 'local coupons',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    locale: SITE_LOCALE,
    url: '/',
    siteName: SITE_NAME,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [
      {
        url: SITE_OG_IMAGE,
        width: SITE_OG_IMAGE_WIDTH,
        height: SITE_OG_IMAGE_HEIGHT,
        alt: SITE_IMAGE_ALT,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [
      {
        url: SITE_OG_IMAGE,
        alt: SITE_IMAGE_ALT,
      },
    ],
  },
  icons: {
    icon: [
      {
        url: SITE_ICON,
        type: 'image/svg+xml',
      },
    ],
    shortcut: [SITE_ICON],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  formatDetection: {
    telephone: false,
    address: false,
    email: false,
  },
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
      <head>
        <style
          id="coupon-map-critical-styles"
          dangerouslySetInnerHTML={{ __html: couponMapStyles }}
        />
        <script async src="https://www.googletagmanager.com/gtag/js?id=G-YW4N6K6GD8" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());

              gtag('config', 'G-YW4N6K6GD8');
            `,
          }}
        />
      </head>
      <body>
        <AmplitudeInitializer />
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
