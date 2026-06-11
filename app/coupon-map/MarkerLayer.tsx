import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
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
 * Owns high-frequency marker projection outside React state so map pans/zooms
 * update CSS variables without re-rendering the surrounding coupon UI.
 * Subscribes to map movement directly and exposes an imperative `reproject()`
 * for parent-driven map mutations (relayout/fit/pan).
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
    const frameRef = useRef<number | null>(null);
    const markerRefs = useRef(new Map<string, HTMLButtonElement>());
    const locationRef = useRef<HTMLDivElement | null>(null);
    const storesRef = useRef(stores);
    const coordsRef = useRef(userCoords);

    storesRef.current = stores;
    coordsRef.current = userCoords;

    const setMarkerElement = useCallback(
      (storeId: string, element: HTMLButtonElement | null) => {
        if (element) {
          markerRefs.current.set(storeId, element);
          return;
        }

        markerRefs.current.delete(storeId);
      },
      []
    );

    const reproject = useCallback(() => {
      if (frameRef.current !== null) return;

      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = null;
        if (!map || !kakaoMaps) return;

        const projection = map.getProjection();
        for (const store of storesRef.current) {
          const marker = markerRefs.current.get(store.id);
          if (!marker) continue;

          setProjectedPoint(
            marker,
            projection.containerPointFromCoords(new kakaoMaps.LatLng(store.lat, store.lng))
          );
        }

        const coords = coordsRef.current;
        const location = locationRef.current;
        if (location) {
          setProjectedPoint(
            location,
            projection.containerPointFromCoords(new kakaoMaps.LatLng(coords.lat, coords.lng)),
            '--user-x',
            '--user-y'
          );
        }
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
          ref={locationRef}
          className="myLocation"
          aria-hidden="true"
        >
          <span />
        </div>
        {stores.map((store) => {
          const isProjected = mapProviderStatus === 'ready';
          const markerStyle = isProjected
            ? ({
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
              ref={(element) => setMarkerElement(store.id, element)}
              type="button"
              className={`marker ${isProjected ? 'isProjected' : 'isFallbackPosition'} ${store.id === activeStoreId ? 'selected' : ''}`}
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

function setProjectedPoint(
  element: HTMLElement,
  point: MarkerScreenPoint,
  xProperty = '--pin-x',
  yProperty = '--pin-y'
) {
  setStyleProperty(element, xProperty, `${point.x}px`);
  setStyleProperty(element, yProperty, `${point.y}px`);
  element.dataset.projected = 'true';
}

function setStyleProperty(element: HTMLElement, property: string, value: string) {
  if (element.style.getPropertyValue(property) === value) return;
  element.style.setProperty(property, value);
}
