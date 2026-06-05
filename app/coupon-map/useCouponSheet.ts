import { useCallback, useRef, useState } from 'react';

import {
  COUPON_SHEET_DRAG_THRESHOLD_PX,
  COUPON_SHEET_EXPAND_DRAG_THRESHOLD_PX,
  type CouponSheetDragState,
  getPointerY,
  resolveCouponSheetDragY,
} from '../../lib/couponSheet';
import { isMobileCouponSheet } from '../../lib/kakaoMap';

/**
 * Open/lowered/expanded state and pointer-drag handling for the mobile coupon
 * bottom sheet. `openPanelForSelection` and `collapseSheet` let the orchestrator
 * reset the sheet when a store is selected or the map recenters.
 */
export function useCouponSheet() {
  const sheetDragRef = useRef<CouponSheetDragState | null>(null);
  const [isCouponPanelOpen, setIsCouponPanelOpen] = useState(true);
  const [isCouponSheetLowered, setIsCouponSheetLowered] = useState(false);
  const [isCouponSheetExpanded, setIsCouponSheetExpanded] = useState(false);
  const [sheetDragY, setSheetDragY] = useState(0);
  const [isSheetDragging, setIsSheetDragging] = useState(false);

  const openPanelForSelection = useCallback(() => {
    setIsCouponPanelOpen(true);
    setIsCouponSheetLowered(false);
    setIsCouponSheetExpanded(false);
  }, []);

  const collapseSheet = useCallback(() => {
    setIsCouponSheetExpanded(false);
    setIsCouponSheetLowered(false);
  }, []);

  const toggleCouponPanel = useCallback(() => {
    setIsCouponPanelOpen((isOpen) => {
      const nextIsOpen = !isOpen;
      if (nextIsOpen) {
        setIsCouponSheetLowered(false);
        setIsCouponSheetExpanded(false);
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
        isExpanded: isCouponSheetExpanded,
        isLowered: isCouponSheetLowered,
      });
      setSheetDragY(nextDragY);
      if (nextDragY !== 0) event.preventDefault();
    },
    [isCouponSheetExpanded, isCouponSheetLowered]
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

      if (isCouponSheetExpanded) {
        if (finalDragY >= COUPON_SHEET_DRAG_THRESHOLD_PX) {
          setIsCouponSheetExpanded(false);
        }
        return;
      }

      if (isCouponSheetLowered) {
        if (signedDragY <= -COUPON_SHEET_EXPAND_DRAG_THRESHOLD_PX) {
          setIsCouponSheetLowered(false);
          setIsCouponSheetExpanded(true);
        } else if (signedDragY <= -COUPON_SHEET_DRAG_THRESHOLD_PX || Math.abs(signedDragY) < 8) {
          setIsCouponSheetLowered(false);
        }
        return;
      }

      if (signedDragY <= -COUPON_SHEET_DRAG_THRESHOLD_PX) {
        setIsCouponSheetExpanded(true);
        return;
      }

      if (finalDragY >= COUPON_SHEET_DRAG_THRESHOLD_PX) {
        setIsCouponSheetLowered(true);
      }
    },
    [isCouponSheetExpanded, isCouponSheetLowered]
  );

  const lowerExpandedSheetFromMap = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      if (!isCouponPanelOpen || !isCouponSheetExpanded || !isMobileCouponSheet()) return;
      if (event.target instanceof Element && event.target.closest('.marker')) return;

      setIsCouponSheetExpanded(false);
      setIsCouponSheetLowered(true);
      setSheetDragY(0);
    },
    [isCouponPanelOpen, isCouponSheetExpanded]
  );

  return {
    isCouponPanelOpen,
    isCouponSheetLowered,
    isCouponSheetExpanded,
    sheetDragY,
    isSheetDragging,
    openPanelForSelection,
    collapseSheet,
    toggleCouponPanel,
    startCouponSheetDrag,
    moveCouponSheetDrag,
    finishCouponSheetDrag,
    lowerExpandedSheetFromMap,
  };
}
