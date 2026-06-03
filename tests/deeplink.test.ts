import { describe, it, expect } from 'vitest';
import { resolveDeepLinkTarget } from '../lib/deeplink';
import type { Brand } from '../lib/types';

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
