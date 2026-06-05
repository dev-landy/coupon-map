import { useCallback, useRef, useState } from 'react';

import {
  COUPON_SHEET_DRAG_THRESHOLD_PX,
  type CouponSheetDragState,
  getPointerY,
  resolveCouponSheetDragY,
} from '../../lib/couponSheet';
import { isMobileCouponSheet } from '../../lib/kakaoMap';

/**
 * Open/lowered state and pointer-drag handling for the mobile coupon bottom
 * sheet. `openPanelForSelection` and `collapseSheet` let the orchestrator reset
 * the sheet when a store is selected or the map recenters.
 */
export function useCouponSheet() {
  const sheetDragRef = useRef<CouponSheetDragState | null>(null);
  const [isCouponPanelOpen, setIsCouponPanelOpen] = useState(true);
  const [isCouponSheetLowered, setIsCouponSheetLowered] = useState(false);
  const [sheetDragY, setSheetDragY] = useState(0);
  const [isSheetDragging, setIsSheetDragging] = useState(false);

  const openPanelForSelection = useCallback(() => {
    setIsCouponPanelOpen(true);
    setIsCouponSheetLowered(false);
  }, []);

  const collapseSheet = useCallback(() => {
    setIsCouponSheetLowered(false);
  }, []);

  const toggleCouponPanel = useCallback(() => {
    setIsCouponPanelOpen((isOpen) => {
      const nextIsOpen = !isOpen;
      if (nextIsOpen) {
        setIsCouponSheetLowered(false);
      }
      return nextIsOpen;
    });
  }, []);

  const startCouponSheetDrag = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (!isCouponPanelOpen || !isMobileCouponSheet()) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;

      const pointerY = getPointerY(event);
      sheetDragRef.current = {
        pointerId: event.pointerId,
        startY: pointerY,
        lastY: pointerY,
      };
      setIsSheetDragging(true);
      setSheetDragY(0);
      event.currentTarget.setPointerCapture?.(event.pointerId);
      event.preventDefault();
    },
    [isCouponPanelOpen]
  );

  const moveCouponSheetDrag = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const drag = sheetDragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;

      const pointerY = getPointerY(event);
      drag.lastY = pointerY;
      const rawDragY = pointerY - drag.startY;
      const nextDragY = resolveCouponSheetDragY(rawDragY, {
        isLowered: isCouponSheetLowered,
      });
      setSheetDragY(nextDragY);
      if (nextDragY !== 0) event.preventDefault();
    },
    [isCouponSheetLowered]
  );

  const finishCouponSheetDrag = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const drag = sheetDragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;

      const finalDragY = Math.max(0, drag.lastY - drag.startY);
      const signedDragY = drag.lastY - drag.startY;
      sheetDragRef.current = null;
      setIsSheetDragging(false);
      setSheetDragY(0);
      event.currentTarget.releasePointerCapture?.(event.pointerId);

      if (event.type === 'pointercancel') return;

      if (isCouponSheetLowered) {
        if (signedDragY <= -COUPON_SHEET_DRAG_THRESHOLD_PX || Math.abs(signedDragY) < 8) {
          setIsCouponSheetLowered(false);
        }
        return;
      }

      if (finalDragY >= COUPON_SHEET_DRAG_THRESHOLD_PX) {
        setIsCouponSheetLowered(true);
      }
    },
    [isCouponSheetLowered]
  );

  return {
    isCouponPanelOpen,
    isCouponSheetLowered,
    sheetDragY,
    isSheetDragging,
    openPanelForSelection,
    collapseSheet,
    toggleCouponPanel,
    startCouponSheetDrag,
    moveCouponSheetDrag,
    finishCouponSheetDrag,
  };
}
