import { memo } from 'react';

import type { CouponMapCoupon, CouponMapStore } from '../../lib/frontendData';
import { formatDistanceLabel } from '../../lib/format';
import { BrandLogo } from './BrandLogo';

export const CouponListRow = memo(function CouponListRow({
  rowId,
  store,
  coupon,
  isSelected,
  onSelect,
  onOpenApp,
}: {
  rowId?: string;
  store: CouponMapStore;
  coupon: CouponMapCoupon;
  isSelected: boolean;
  onSelect: (storeId: string, couponId: string) => void;
  onOpenApp: (
    store: CouponMapStore,
    coupon: CouponMapCoupon,
    source: 'coupon_list'
  ) => void;
}) {
  const locationLabel =
    store.distanceMeters === undefined
      ? store.address
      : `${formatDistanceLabel(store.distanceMeters)} · ${store.address}`;

  return (
    <button
      type="button"
      className={`couponListRow ${isSelected ? 'selected' : ''}`}
      id={rowId}
      aria-pressed={isSelected}
      aria-current={isSelected ? 'true' : undefined}
      aria-label={`${store.brandName} ${store.name} ${coupon.title} ${coupon.headline}`}
      onClick={() => {
        onSelect(store.id, coupon.id);
        onOpenApp(store, coupon, 'coupon_list');
      }}
    >
      <BrandLogo store={store} className="storeLogo" />
      <div className="couponRowCopy">
        <div className="couponRowTitle">
          <h3>{coupon.title}</h3>
          <span>{coupon.validLabel}</span>
        </div>
        <p>{coupon.detail}</p>
        <address>{`${store.brandName} ${store.name} · ${locationLabel}`}</address>
      </div>
      <div className="couponRowDeal">
        <small>{coupon.discountType}</small>
        <strong>{coupon.headline}</strong>
      </div>
    </button>
  );
});
