import type { CouponMapStore } from '../../lib/frontendData';

const KFC_BRAND_COLOR = '#e4002b';

export function BrandLogo({
  store,
  className,
}: {
  store: CouponMapStore;
  className: 'pinLogo' | 'brandLogo' | 'storeLogo';
}) {
  const logo = resolveBrandLogo(store);

  return (
    <span
      className={`${className} brandBadge`}
      style={{ background: logo.background }}
      data-brand-logo={logo.kind}
      aria-hidden="true"
    >
      {logo.label}
    </span>
  );
}

function resolveBrandLogo(store: CouponMapStore): {
  kind: string;
  label: string;
  background: string;
} {
  const brandTokens = [
    store.brandName,
    store.brand.source,
    store.brand.external_id,
    store.brand.store_url,
  ]
    .filter((token): token is string => typeof token === 'string')
    .join(' ')
    .toLowerCase();

  if (/\bkfc\b/.test(brandTokens) || brandTokens.includes('kfckorea')) {
    return {
      kind: 'kfc',
      label: 'KFC',
      background: KFC_BRAND_COLOR,
    };
  }

  if (brandTokens.includes('맥도날드') || /\bmcdonalds?\b/.test(brandTokens)) {
    return {
      kind: 'mcdonalds',
      label: '맥도날드',
      background: store.brandColor,
    };
  }

  if (brandTokens.includes('버거킹') || /\bburger\s*king\b/.test(brandTokens)) {
    return {
      kind: 'burgerking',
      label: '버거킹',
      background: store.brandColor,
    };
  }

  return {
    kind: 'default',
    label: store.brandInitial,
    background: store.brandColor,
  };
}
