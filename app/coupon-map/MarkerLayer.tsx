import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';

import type { CouponMapStore } from '../../lib/frontendData';
import type {
  KakaoMap,
  KakaoMapsNamespace,
  MapProviderStatus,
  MarkerScreenPoint,
} from '../../lib/kakaoMap';
import type { Coords } from '../../lib/location';
import { BrandLogo } from './BrandLogo';

const MARKER_EVENTS = ['center_changed', 'bounds_changed', 'zoom_changed'] as const;

export interface MarkerLayerHandle {
  reproject: () => void;
}

interface MarkerLayerProps {
  map: KakaoMap | null;
  kakaoMaps: KakaoMapsNamespace | null;
  stores: CouponMapStore[];
  userCoords: Coords;
  mapProviderStatus: MapProviderStatus;
  showFallbackPins: boolean;
  activeStoreId: string | null;
  onSelectStore: (storeId: string) => void;
}

/**
 * Owns high-frequency marker projection state so map pans/zooms re-render only
 * this layer, not the surrounding coupon panel. Subscribes to map movement
 * directly and exposes an imperative `reproject()` for parent-driven map
 * mutations (relayout/fit/pan).
 */
export const MarkerLayer = memo(
  forwardRef<MarkerLayerHandle, MarkerLayerProps>(function MarkerLayer(
    {
      map,
      kakaoMaps,
      stores,
      userCoords,
      mapProviderStatus,
      showFallbackPins,
      activeStoreId,
      onSelectStore,
    },
    ref
  ) {
    const [markerPoints, setMarkerPoints] = useState<Record<string, MarkerScreenPoint>>({});
    const [locationPoint, setLocationPoint] = useState<MarkerScreenPoint | null>(null);
    const frameRef = useRef<number | null>(null);
    const storesRef = useRef(stores);
    const coordsRef = useRef(userCoords);

    storesRef.current = stores;
    coordsRef.current = userCoords;

    const reproject = useCallback(() => {
      if (frameRef.current !== null) return;

      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = null;
        if (!map || !kakaoMaps) return;

        const projection = map.getProjection();
        const nextPoints: Record<string, MarkerScreenPoint> = {};
        for (const store of storesRef.current) {
          nextPoints[store.id] = projection.containerPointFromCoords(
            new kakaoMaps.LatLng(store.lat, store.lng)
          );
        }

        const coords = coordsRef.current;
        const nextLocation = projection.containerPointFromCoords(
          new kakaoMaps.LatLng(coords.lat, coords.lng)
        );

        setMarkerPoints((prev) => (arePointMapsEqual(prev, nextPoints) ? prev : nextPoints));
        setLocationPoint((prev) => (arePointsEqual(prev, nextLocation) ? prev : nextLocation));
      });
    }, [kakaoMaps, map]);

    useImperativeHandle(ref, () => ({ reproject }), [reproject]);

    useEffect(() => {
      if (!map || !kakaoMaps) return;

      for (const eventName of MARKER_EVENTS) {
        kakaoMaps.event.addListener(map, eventName, reproject);
      }
      reproject();

      return () => {
        for (const eventName of MARKER_EVENTS) {
          kakaoMaps.event.removeListener(map, eventName, reproject);
        }
        if (frameRef.current !== null) {
          window.cancelAnimationFrame(frameRef.current);
          frameRef.current = null;
        }
      };
    }, [kakaoMaps, map, reproject]);

    const markerDataKey = stores
      .map((store) => `${store.id}:${store.lat},${store.lng}`)
      .join('|');

    useEffect(() => {
      if (mapProviderStatus !== 'ready') return;
      reproject();
    }, [mapProviderStatus, markerDataKey, reproject, userCoords.lat, userCoords.lng]);

    if (!showFallbackPins) return null;

    return (
      <>
        <div
          className="myLocation"
          style={
            locationPoint
              ? ({
                  '--user-x': `${locationPoint.x}px`,
                  '--user-y': `${locationPoint.y}px`,
                } as React.CSSProperties)
              : undefined
          }
          aria-hidden="true"
        >
          <span />
        </div>
        {stores.map((store) => {
          const markerPoint =
            mapProviderStatus === 'ready' ? markerPoints[store.id] : undefined;
          if (mapProviderStatus === 'ready' && !markerPoint) return null;

          const markerStyle = markerPoint
            ? ({
                '--pin-x': `${markerPoint.x}px`,
                '--pin-y': `${markerPoint.y}px`,
                '--brand-color': store.brandColor,
              } as React.CSSProperties)
            : ({
                '--pin-x': `${store.markerX}%`,
                '--pin-y': `${store.markerY}%`,
                '--pin-mobile-x': `${16 + store.markerX * 0.68}%`,
                '--pin-mobile-y': `${18 + store.markerY * 0.28}%`,
                '--brand-color': store.brandColor,
              } as React.CSSProperties);

          return (
            <button
              key={store.id}
              type="button"
              className={`marker ${markerPoint ? 'isProjected' : 'isFallbackPosition'} ${store.id === activeStoreId ? 'selected' : ''}`}
              style={markerStyle}
              aria-label={`${store.brandName} ${store.name} ${store.bestCoupon.headline}`}
              aria-pressed={store.id === activeStoreId}
              aria-controls={`store-${store.id}`}
              onClick={() => onSelectStore(store.id)}
            >
              <span className="pinBubble">
                <BrandLogo store={store} className="pinLogo" />
                <span className="pinDeal">
                  <small>최대</small>
                  <b>{store.bestCoupon.headline}</b>
                </span>
              </span>
              <span className="pinTail" />
            </button>
          );
        })}
      </>
    );
  })
);

function arePointsEqual(a: MarkerScreenPoint | null, b: MarkerScreenPoint | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.x === b.x && a.y === b.y;
}

function arePointMapsEqual(
  a: Record<string, MarkerScreenPoint>,
  b: Record<string, MarkerScreenPoint>
): boolean {
  const aKeys = Object.keys(a);
  if (aKeys.length !== Object.keys(b).length) return false;
  for (const key of aKeys) {
    const av = a[key];
    const bv = b[key];
    if (!bv || av.x !== bv.x || av.y !== bv.y) return false;
  }
  return true;
}
