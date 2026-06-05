import { afterEach, describe, it, expect } from 'vitest';
import { detectPlatform, resolveDeepLinkTarget } from '../lib/deeplink';
import type { Brand } from '../lib/types';

const originalUserAgent = navigator.userAgent;

afterEach(() => {
  Object.defineProperty(navigator, 'userAgent', {
    configurable: true,
    value: originalUserAgent,
  });
});

function makeBrand(overrides: Partial<Brand> = {}): Brand {
  return {
    id: 'b1',
    name: 'Test Brand',
    app_scheme: 'testapp://open',
    store_url: 'https://brand.example.com',
    app_store_url: 'https://apps.apple.com/test',
    ...overrides,
  };
}

function mockUserAgent(userAgent: string): void {
  Object.defineProperty(navigator, 'userAgent', {
    configurable: true,
    value: userAgent,
  });
}

describe('resolveDeepLinkTarget', () => {
  it('prefers a coupon app_link over brand app scheme and web targets', () => {
    // Arrange
    const brand = makeBrand();

    // Act
    const target = resolveDeepLinkTarget(brand, 'mobile', 'testapp://coupon/123');

    // Assert
    expect(target.kind).toBe('coupon-app-link');
    expect(target.url).toBe('testapp://coupon/123');
    expect(target.fallbackUrl).toBe('https://apps.apple.com/test');
  });

  it('returns the app scheme with a store fallback on mobile when a scheme exists', () => {
    // Arrange
    const brand = makeBrand();

    // Act
    const target = resolveDeepLinkTarget(brand, 'mobile');

    // Assert
    expect(target.kind).toBe('app-scheme');
    expect(target.url).toBe('testapp://open');
    expect(target.fallbackUrl).toBe('https://apps.apple.com/test');
  });

  it('falls back to store_url on mobile when app_store_url is missing', () => {
    // Arrange
    const brand = makeBrand({ app_store_url: null });

    // Act
    const target = resolveDeepLinkTarget(brand, 'mobile');

    // Assert
    expect(target.kind).toBe('app-scheme');
    expect(target.fallbackUrl).toBe('https://brand.example.com');
  });

  it('uses the iOS App Store fallback for a known brand on iPhone', () => {
    // Arrange
    const brand = makeBrand({
      external_id: 'burgerking',
      name: '버거킹',
      app_scheme: 'burgerking://main',
      app_store_url: 'https://play.google.com/store/apps/details?id=kr.co.burgerkinghybrid',
    });

    // Act
    const target = resolveDeepLinkTarget(brand, 'ios');

    // Assert
    expect(target.kind).toBe('app-scheme');
    expect(target.url).toBe('burgerking://main');
    expect(target.fallbackUrl).toContain('apps.apple.com/kr/app/');
    expect(target.fallbackUrl).toContain('id1017567032');
  });

  it('uses the Play Store fallback for a known brand on Android', () => {
    // Arrange
    const brand = makeBrand({
      external_id: 'burgerking',
      name: '버거킹',
      app_scheme: 'burgerking://main',
      app_store_url: 'https://apps.apple.com/kr/app/id1017567032',
    });

    // Act
    const target = resolveDeepLinkTarget(brand, 'android');

    // Assert
    expect(target.kind).toBe('app-scheme');
    expect(target.url).toBe('burgerking://main');
    expect(target.fallbackUrl).toBe(
      'https://play.google.com/store/apps/details?id=kr.co.burgerkinghybrid'
    );
  });

  it('does not send iPhone users to a Play Store legacy fallback for unknown brands', () => {
    // Arrange
    const brand = makeBrand({
      external_id: 'unknown',
      name: 'Unknown Brand',
      app_store_url: 'https://play.google.com/store/apps/details?id=com.example.app',
    });

    // Act
    const target = resolveDeepLinkTarget(brand, 'ios');

    // Assert
    expect(target.kind).toBe('app-scheme');
    expect(target.fallbackUrl).toBe('https://brand.example.com');
  });

  it('returns the web store_url on mobile when there is no app scheme', () => {
    // Arrange
    const brand = makeBrand({ app_scheme: null });

    // Act
    const target = resolveDeepLinkTarget(brand, 'mobile');

    // Assert
    expect(target.kind).toBe('web');
    expect(target.url).toBe('https://brand.example.com');
    expect(target.fallbackUrl).toBeNull();
  });

  it('treats an empty-string app scheme as missing and falls back to web', () => {
    // Arrange
    const brand = makeBrand({ app_scheme: '   ' });

    // Act
    const target = resolveDeepLinkTarget(brand, 'mobile');

    // Assert
    expect(target.kind).toBe('web');
    expect(target.url).toBe('https://brand.example.com');
  });

  it('returns the web store_url on desktop regardless of app scheme', () => {
    // Arrange
    const brand = makeBrand();

    // Act
    const target = resolveDeepLinkTarget(brand, 'desktop');

    // Assert
    expect(target.kind).toBe('web');
    expect(target.url).toBe('https://brand.example.com');
    expect(target.fallbackUrl).toBeNull();
  });

  it('throws on desktop when store_url is missing (malformed data)', () => {
    // Arrange
    const brand = makeBrand({ store_url: '' });

    // Act / Assert
    expect(() => resolveDeepLinkTarget(brand, 'desktop')).toThrow();
  });

  it('throws on mobile when both app_scheme and store_url are missing', () => {
    // Arrange
    const brand = makeBrand({ app_scheme: null, store_url: '' });

    // Act / Assert
    expect(() => resolveDeepLinkTarget(brand, 'mobile')).toThrow();
  });
});

describe('detectPlatform', () => {
  it('detects iPhone user agents as iOS', () => {
    mockUserAgent(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15'
    );

    expect(detectPlatform()).toBe('ios');
  });

  it('detects Android user agents as Android', () => {
    mockUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36');

    expect(detectPlatform()).toBe('android');
  });
});
