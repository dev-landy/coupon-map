import { memo } from 'react';

import { openBrandApp } from '../../lib/deeplink';
import { COUPON_SHEET_PEEK_HEIGHT_PX } from '../../lib/couponSheet';
import { formatRadiusLabel } from '../../lib/format';
import type {
  CouponMapCoupon,
  CouponMapStore,
  CouponMapView,
} from '../../lib/frontendData';
import { BrandLogo } from './BrandLogo';
import { CouponListRow } from './CouponListRow';
import type { FeedbackType } from './FeedbackDialog';
import { ArrowIcon, PanelToggleIcon } from './icons';

export interface CouponListItem {
  store: CouponMapStore;
  coupon: CouponMapCoupon;
  rowId?: string;
  key: string;
}

interface CouponPanelProps {
  isCouponPanelOpen: boolean;
  isCouponSheetLowered: boolean;
  isCouponSheetExpanded: boolean;
  isSheetDragging: boolean;
  sheetDragY: number;
  panelToggleLabel: string;
  totals: CouponMapView['totals'];
  searchRadiusMeters: number;
  couponListItems: CouponListItem[];
  selectedStore: CouponMapStore | null;
  selectedCoupon: CouponMapCoupon | null;
  activeStoreId: string | null;
  onToggle: () => void;
  onSheetPointerDown: (event: React.PointerEvent<HTMLElement>) => void;
  onSheetPointerMove: (event: React.PointerEvent<HTMLElement>) => void;
  onSheetPointerEnd: (event: React.PointerEvent<HTMLElement>) => void;
  onSelectCoupon: (storeId: string, couponId: string) => void;
  onOpenFeedback: (type: FeedbackType) => void;
}

/**
 * Memoized coupon side panel / mobile bottom sheet. Kept separate from the
 * orchestrator so map panning and feedback typing don't re-render the coupon
 * list.
 */
export const CouponPanel = memo(function CouponPanel({
  isCouponPanelOpen,
  isCouponSheetLowered,
  isCouponSheetExpanded,
  isSheetDragging,
  sheetDragY,
  panelToggleLabel,
  totals,
  searchRadiusMeters,
  couponListItems,
  selectedStore,
  selectedCoupon,
  activeStoreId,
  onToggle,
  onSheetPointerDown,
  onSheetPointerMove,
  onSheetPointerEnd,
  onSelectCoupon,
  onOpenFeedback,
}: CouponPanelProps) {
  return (
    <div
      className={`panelDock ${isCouponPanelOpen ? 'isPanelOpen' : 'isPanelClosed'} ${isCouponSheetLowered ? 'isSheetLowered' : ''} ${isCouponSheetExpanded ? 'isSheetExpanded' : ''} ${isSheetDragging ? 'isSheetDragging' : ''}`}
      style={
        {
          '--sheet-base-y': isCouponSheetLowered
            ? `calc(100% - ${COUPON_SHEET_PEEK_HEIGHT_PX}px)`
            : '0px',
          '--sheet-drag-y': `${sheetDragY}px`,
        } as React.CSSProperties
      }
    >
      <button
        type="button"
        className="panelToggle"
        aria-controls="coupon-panel"
        aria-expanded={isCouponPanelOpen}
        aria-label={panelToggleLabel}
        onClick={onToggle}
      >
        <PanelToggleIcon />
      </button>
      <aside
        id="coupon-panel"
        className="couponPanel"
        aria-hidden={isCouponPanelOpen ? undefined : true}
        aria-label="nearby coupons"
      >
        {isCouponPanelOpen ? (
          <>
            <div
              className="sheetDragArea"
              onPointerDown={onSheetPointerDown}
              onPointerMove={onSheetPointerMove}
              onPointerUp={onSheetPointerEnd}
              onPointerCancel={onSheetPointerEnd}
            >
              <div className="sheetHandle" aria-hidden="true" />
              <div className="panelHeader">
                <div>
                  <p className="eyebrow">CouponMap</p>
                  <h1>근처 쿠폰 매장</h1>
                </div>
                <div className="stats" aria-label="coupon summary">
                  <span>{totals.brands} brands</span>
                  <span>{totals.stores} stores</span>
                  <span>{totals.activeCoupons} coupons</span>
                </div>
              </div>
            </div>

            <div className="panelScroll">
              {selectedStore && selectedCoupon ? (
                <section
                  className="selectedDetail"
                  aria-live="polite"
                  data-testid="selected-store-detail"
                  data-selected-store-id={selectedStore.id}
                  data-selected-coupon-id={selectedCoupon.id}
                >
                  <div className="selectedHead">
                    <BrandLogo store={selectedStore} className="brandLogo" />
                    <div>
                      <p>{selectedStore.brandName}</p>
                      <h2>{selectedCoupon.title}</h2>
                      <span>{selectedStore.name}</span>
                    </div>
                    <strong>{selectedCoupon.headline}</strong>
                  </div>

                  {selectedCoupon.facts.length > 0 ? (
                    <dl className="couponFacts" aria-label="coupon details">
                      {selectedCoupon.facts.map((fact) => (
                        <div key={`${fact.label}-${fact.value}`}>
                          <dt>{fact.label}</dt>
                          <dd>{fact.value}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}

                  <div className="selectedActions">
                    <button
                      type="button"
                      className="openAppButton"
                      onClick={() =>
                        openBrandApp(selectedStore.brand, undefined, selectedCoupon.appLink)
                      }
                    >
                      앱에서 열기
                      <ArrowIcon />
                    </button>
                    <button
                      type="button"
                      className="reportCouponButton"
                      onClick={() => onOpenFeedback('coupon_incorrect')}
                    >
                      정보 수정 제안
                    </button>
                  </div>
                </section>
              ) : null}

              <div className="sectionHeader">
                <h2>{formatRadiusLabel(searchRadiusMeters)} 내 쿠폰</h2>
                <span>{couponListItems.length}</span>
              </div>

              <div className="couponList" aria-label="nearby coupon list">
                {couponListItems.map((item) => (
                  <CouponListRow
                    key={item.key}
                    rowId={item.rowId}
                    store={item.store}
                    coupon={item.coupon}
                    isSelected={
                      item.store.id === activeStoreId && item.coupon.id === selectedCoupon?.id
                    }
                    onSelect={onSelectCoupon}
                  />
                ))}
              </div>

              <footer className="feedbackEntry">
                <button
                  type="button"
                  className="feedbackOpenButton"
                  onClick={() => onOpenFeedback(selectedStore ? 'other' : 'feature_request')}
                >
                  피드백 보내기
                </button>
              </footer>
            </div>
          </>
        ) : null}
      </aside>
    </div>
  );
});
