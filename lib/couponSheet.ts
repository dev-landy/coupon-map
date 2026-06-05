import type { PointerEvent } from 'react';

/** Geometry + thresholds for the draggable mobile coupon bottom sheet. */

export const COUPON_SHEET_PEEK_HEIGHT_PX = 124;
export const COUPON_SHEET_DRAG_LIMIT_PX = 640;
export const COUPON_SHEET_DRAG_THRESHOLD_PX = 56;

export interface CouponSheetDragState {
  pointerId: number;
  startY: number;
  lastY: number;
}

export function getPointerY(event: PointerEvent<HTMLElement>): number {
  const candidates = [
    event.pageY,
    event.nativeEvent.pageY,
    event.clientY,
    event.nativeEvent.clientY,
  ];
  return candidates.find((value) => Number.isFinite(value)) ?? 0;
}

export function resolveCouponSheetDragY(
  rawDragY: number,
  state: { isLowered: boolean }
): number {
  if (state.isLowered) {
    return Math.max(-COUPON_SHEET_DRAG_LIMIT_PX, Math.min(0, rawDragY));
  }

  return Math.min(COUPON_SHEET_DRAG_LIMIT_PX, Math.max(0, rawDragY));
}
