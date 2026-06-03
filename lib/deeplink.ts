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

export type Platform = 'mobile' | 'desktop';

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

/**
 * Decide where to send the user. Pure: no globals, no side effects.
 *
 * Rules:
 *  - desktop                -> brand.store_url (web).
 *  - mobile + app_scheme    -> scheme, with app_store_url (or store_url) as fallback.
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
  const fallbackUrl = isNonEmpty(brand.app_store_url)
    ? brand.app_store_url
    : hasWeb
      ? brand.store_url
      : null;

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
  const isMobile = /Android|iPhone|iPad|iPod|webOS|BlackBerry|Windows Phone/i.test(
    navigator.userAgent
  );
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
