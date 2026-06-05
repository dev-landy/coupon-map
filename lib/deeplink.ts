import type { Brand } from './types';

/**
 * Deep-link handoff to a brand's own app.
 *
 * The coupon is NOT redeemed in 쿠폰맵 — we hand the user off to the brand
 * app (or its web store as a fallback). The decision of WHERE to send the
 * user is a pure function (`resolveDeepLinkTarget`) so it is fully unit
 * testable; the side-effecting navigation lives in `openBrandApp`.
 */

/** How long to wait for the app scheme to take over before falling back. */
export const DEEPLINK_FALLBACK_TIMEOUT_MS = 1500;

export type Platform = 'ios' | 'android' | 'mobile' | 'desktop';

export type DeepLinkKind = 'coupon-app-link' | 'app-scheme' | 'app-store-fallback' | 'web';

export interface DeepLinkTarget {
  /** The URL/scheme to navigate to immediately. */
  url: string;
  /** What kind of target this is, for the caller's branching/telemetry. */
  kind: DeepLinkKind;
  /**
   * On mobile with an app scheme, the URL to navigate to if the app does not
   * take over within DEEPLINK_FALLBACK_TIMEOUT_MS. Null when no fallback is
   * needed (desktop, or no scheme available).
   */
  fallbackUrl: string | null;
}

function isNonEmpty(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

const KNOWN_BRAND_APP_STORE_URLS = [
  {
    keys: ['mcdonalds', 'mcdonalds-kr-adb', '맥도날드'],
    ios: 'https://apps.apple.com/kr/app/%EB%A7%A5%EB%8F%84%EB%82%A0%EB%93%9C/id1217507712',
    android: 'https://play.google.com/store/apps/details?id=com.mcdonalds.mobileapp',
  },
  {
    keys: ['burgerking', 'burgerking-kr-adb', '버거킹'],
    ios: 'https://apps.apple.com/kr/app/%EB%B2%84%EA%B1%B0%ED%82%B9-%ED%96%84%EB%B2%84%EA%B1%B0-%ED%82%B9%EC%98%A4%EB%8D%94-%EB%94%9C%EB%A6%AC%EB%B2%84%EB%A6%AC/id1017567032',
    android: 'https://play.google.com/store/apps/details?id=kr.co.burgerkinghybrid',
  },
  {
    keys: ['kfc', 'kfc-kr-adb'],
    ios: 'https://apps.apple.com/kr/app/kfc-korea/id1255799839',
    android: 'https://play.google.com/store/apps/details?id=kfc_ko.kore.kg.kfc_korea',
  },
  {
    keys: ['yogiyo', 'yogiyo-kr-adb', '요기요'],
    ios: 'https://apps.apple.com/kr/app/%EB%B0%B0%EB%8B%AC%EC%9A%94%EA%B8%B0%EC%9A%94-%EA%B8%B0%EB%8B%A4%EB%A6%BC-%EC%97%86%EB%8A%94-%EB%A7%9B%EC%A7%91-%EB%B0%B0%EB%8B%AC%EC%95%B1/id543831532',
    android: 'https://play.google.com/store/apps/details?id=com.fineapp.yogiyo',
  },
];

function resolveKnownBrandAppStoreUrl(
  brand: Brand,
  platform: Extract<Platform, 'ios' | 'android'>
): string | null {
  const brandKeys = [
    brand.external_id,
    brand.source,
    brand.name,
  ].flatMap((value) => normalizeBrandKey(value));

  const match = KNOWN_BRAND_APP_STORE_URLS.find((candidate) =>
    candidate.keys.some((key) => brandKeys.includes(normalizeBrandKey(key)[0] ?? ''))
  );

  return match?.[platform] ?? null;
}

function normalizeBrandKey(value: string | null | undefined): string[] {
  if (!isNonEmpty(value)) return [];
  const normalized = value.trim().toLowerCase();
  return [normalized, normalized.replace(/[^a-z0-9가-힣]/g, '')].filter(Boolean);
}

function isAppleAppStoreUrl(value: string | null | undefined): value is string {
  return isNonEmpty(value) && /^https:\/\/apps\.apple\.com\//i.test(value.trim());
}

function isGooglePlayStoreUrl(value: string | null | undefined): value is string {
  return isNonEmpty(value) && /^https:\/\/play\.google\.com\/store\/apps\//i.test(value.trim());
}

function resolveMobileFallbackUrl(brand: Brand, platform: Platform): string | null {
  const hasWeb = isNonEmpty(brand.store_url);

  if (platform === 'ios') {
    return (
      resolveKnownBrandAppStoreUrl(brand, 'ios') ??
      (isAppleAppStoreUrl(brand.app_store_url) ? brand.app_store_url : null) ??
      (hasWeb ? brand.store_url : null)
    );
  }

  if (platform === 'android') {
    return (
      resolveKnownBrandAppStoreUrl(brand, 'android') ??
      (isGooglePlayStoreUrl(brand.app_store_url) ? brand.app_store_url : null) ??
      (hasWeb ? brand.store_url : null)
    );
  }

  return isNonEmpty(brand.app_store_url)
    ? brand.app_store_url
    : hasWeb
      ? brand.store_url
      : null;
}

/**
 * Decide where to send the user. Pure: no globals, no side effects.
 *
 * Rules:
 *  - desktop                -> brand.store_url (web).
 *  - iOS/Android + app_scheme -> scheme, with OS-matched app store (or store_url) fallback.
 *  - mobile, no app_scheme  -> brand.store_url (web), no fallback needed.
 *
 * Throws if there is no usable target at all (store_url is required by the
 * schema, so this guards against malformed data rather than normal flow).
 */
export function resolveDeepLinkTarget(
  brand: Brand,
  platform: Platform,
  couponAppLink?: string | null
): DeepLinkTarget {
  const hasWeb = isNonEmpty(brand.store_url);
  const fallbackUrl = resolveMobileFallbackUrl(brand, platform);

  if (isNonEmpty(couponAppLink)) {
    return {
      url: couponAppLink.trim(),
      kind: 'coupon-app-link',
      fallbackUrl,
    };
  }

  if (platform === 'desktop') {
    if (!hasWeb) {
      throw new Error(`Brand "${brand.name}" has no store_url for desktop navigation.`);
    }
    return { url: brand.store_url, kind: 'web', fallbackUrl: null };
  }

  // mobile
  if (isNonEmpty(brand.app_scheme)) {
    return { url: brand.app_scheme, kind: 'app-scheme', fallbackUrl };
  }

  // mobile, no scheme -> web fallback
  if (!hasWeb) {
    throw new Error(`Brand "${brand.name}" has neither app_scheme nor store_url.`);
  }
  return { url: brand.store_url, kind: 'web', fallbackUrl: null };
}

/** Detect platform from the current user agent. Browser-only. */
export function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'desktop';
  if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) return 'ios';
  if (/Android/i.test(navigator.userAgent)) return 'android';
  const isMobile = /webOS|BlackBerry|Windows Phone/i.test(navigator.userAgent);
  return isMobile ? 'mobile' : 'desktop';
}

/**
 * Side-effecting handoff. Resolves the target and navigates the browser.
 *
 * On mobile app-scheme targets we attempt the scheme, then fall back to the
 * store URL if the page is still visible after the timeout (the app failing
 * to open leaves us on the page; a successful open backgrounds the tab).
 */
export function openBrandApp(
  brand: Brand,
  platform: Platform = detectPlatform(),
  couponAppLink?: string | null
): void {
  if (typeof window === 'undefined') {
    throw new Error('openBrandApp can only run in the browser.');
  }

  const target = resolveDeepLinkTarget(brand, platform, couponAppLink);

  if (
    (target.kind !== 'app-scheme' && target.kind !== 'coupon-app-link') ||
    target.fallbackUrl === null
  ) {
    window.location.href = target.url;
    return;
  }

  const fallbackUrl = target.fallbackUrl;
  let didHide = false;
  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') didHide = true;
  };
  document.addEventListener('visibilitychange', onVisibilityChange);

  window.location.href = target.url;

  window.setTimeout(() => {
    document.removeEventListener('visibilitychange', onVisibilityChange);
    if (!didHide && document.visibilityState === 'visible') {
      window.location.href = fallbackUrl;
    }
  }, DEEPLINK_FALLBACK_TIMEOUT_MS);
}
