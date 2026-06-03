'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { openBrandApp } from '../lib/deeplink';
import { useUserLocation } from '../lib/geo';
import type {
  CouponMapCoupon,
  CouponMapLoadStatus,
  CouponMapStore,
  CouponMapView,
} from '../lib/frontendData';
import { DEFAULT_LOCATION, type Coords } from '../lib/location';
import { radiusMetersForMapLevel } from '../lib/mapScale';
import { DEFAULT_RADIUS_METERS, haversineMeters } from '../lib/stores';

export type { CouponMapLoadStatus } from '../lib/frontendData';

type MapProviderStatus = 'loading' | 'ready' | 'missing-key' | 'error';

interface MarkerScreenPoint {
  x: number;
  y: number;
}

interface KakaoLatLng {
  getLat(): number;
  getLng(): number;
}

interface KakaoLatLngBounds {
  extend(latlng: KakaoLatLng): void;
}

interface KakaoMapProjection {
  containerPointFromCoords(latlng: KakaoLatLng): MarkerScreenPoint;
}

interface KakaoMap {
  getCenter(): KakaoLatLng;
  getLevel(): number;
  getProjection(): KakaoMapProjection;
  panTo(latlng: KakaoLatLng): void;
  relayout(): void;
  setBounds(
    bounds: KakaoLatLngBounds,
    paddingTop?: number,
    paddingRight?: number,
    paddingBottom?: number,
    paddingLeft?: number
  ): void;
  setCenter(latlng: KakaoLatLng): void;
  setLevel(level: number): void;
}

interface KakaoMapsNamespace {
  LatLng: new (lat: number, lng: number) => KakaoLatLng;
  LatLngBounds: new () => KakaoLatLngBounds;
  Map: new (
    container: HTMLElement,
    options: {
      center: KakaoLatLng;
      level: number;
      scrollwheel?: boolean;
      tileAnimation?: boolean;
    }
  ) => KakaoMap;
  event: {
    addListener(target: unknown, eventName: string, handler: () => void): void;
    removeListener(target: unknown, eventName: string, handler: () => void): void;
  };
  load(callback: () => void): void;
}

interface KakaoMapListener {
  target: unknown;
  eventName: string;
  handler: () => void;
}

declare global {
  interface Window {
    __couponMapKakaoLoader?: Promise<KakaoMapsNamespace>;
    kakao?: {
      maps: KakaoMapsNamespace;
    };
  }
}

interface CouponMapScreenProps {
  view: CouponMapView;
  status: CouponMapLoadStatus;
  message: string | null;
}

interface CouponMapApiResponse {
  view: CouponMapView;
  status: CouponMapLoadStatus;
  message: string | null;
}

const KAKAO_MAP_APP_KEY = process.env.NEXT_PUBLIC_KAKAO_MAP_APP_KEY?.trim() ?? '';
const KAKAO_MAP_SCRIPT_ID = 'coupon-map-kakao-sdk';
const DEFAULT_CENTER = { lat: 37.5572, lng: 126.9254 };
const LOCATION_RELOAD_THRESHOLD_METERS = 50;
const MAP_RELOAD_DEBOUNCE_MS = 500;
const MAP_PROGRAMMATIC_MOVE_SUPPRESSION_MS = 900;
const COUPON_RELOAD_CACHE_TTL_MS = 2 * 60 * 1000;
const COUPON_RELOAD_CACHE_MAX_ENTRIES = 40;
const COUPON_SHEET_PEEK_HEIGHT_PX = 124;
const COUPON_SHEET_EXPANDED_TOP_GAP_PX = 72;
const COUPON_SHEET_DRAG_LIMIT_PX = 640;
const COUPON_SHEET_DRAG_THRESHOLD_PX = 56;
const COUPON_SHEET_EXPAND_DRAG_THRESHOLD_PX = 180;
const KFC_BRAND_COLOR = '#e4002b';

interface CachedCouponMapApiResponse {
  response: CouponMapApiResponse;
  expiresAt: number;
}

interface CouponListItem {
  store: CouponMapStore;
  coupon: CouponMapCoupon;
  rowId?: string;
  key: string;
}

interface SelectedCouponSelection {
  storeId: string;
  couponId: string;
}

interface CouponSheetDragState {
  pointerId: number;
  startY: number;
  lastY: number;
}

export default function CouponMapScreen({ view, status, message }: CouponMapScreenProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<KakaoMap | null>(null);
  const kakaoMapsRef = useRef<KakaoMapsNamespace | null>(null);
  const markerFrameRef = useRef<number | null>(null);
  const viewportReloadTimeoutRef = useRef<number | null>(null);
  const viewportReloadSuppressedUntilRef = useRef(0);
  const hasUserMapInteractionRef = useRef(false);
  const activeRequestRef = useRef<AbortController | null>(null);
  const reloadCacheRef = useRef(new Map<string, CachedCouponMapApiResponse>());
  const sheetDragRef = useRef<CouponSheetDragState | null>(null);
  const lastLoadedSearchRef = useRef({ center: DEFAULT_LOCATION, radiusMeters: DEFAULT_RADIUS_METERS });
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(
    view.stores[0]?.id ?? null
  );
  const [selectedCouponSelection, setSelectedCouponSelection] =
    useState<SelectedCouponSelection | null>(null);
  const [displayView, setDisplayView] = useState(view);
  const [loadStatus, setLoadStatus] = useState<CouponMapLoadStatus>(status);
  const [loadMessage, setLoadMessage] = useState<string | null>(message);
  const [searchRadiusMeters, setSearchRadiusMeters] = useState(DEFAULT_RADIUS_METERS);
  const [isCouponPanelOpen, setIsCouponPanelOpen] = useState(true);
  const [isCouponSheetLowered, setIsCouponSheetLowered] = useState(false);
  const [isCouponSheetExpanded, setIsCouponSheetExpanded] = useState(false);
  const [sheetDragY, setSheetDragY] = useState(0);
  const [isSheetDragging, setIsSheetDragging] = useState(false);
  const [mapProviderStatus, setMapProviderStatus] = useState<MapProviderStatus>(
    KAKAO_MAP_APP_KEY ? 'loading' : 'missing-key'
  );
  const [markerPoints, setMarkerPoints] = useState<Record<string, MarkerScreenPoint>>({});
  const [locationPoint, setLocationPoint] = useState<MarkerScreenPoint | null>(null);
  const userLocation = useUserLocation();
  const storesRef = useRef(displayView.stores);
  const userCoordsRef = useRef<Coords>(userLocation.coords);
  const searchRadiusRef = useRef(searchRadiusMeters);

  storesRef.current = displayView.stores;
  userCoordsRef.current = userLocation.coords;
  searchRadiusRef.current = searchRadiusMeters;

  const selectedStore = useMemo(
    () =>
      displayView.stores.find((store) => store.id === selectedStoreId) ??
      displayView.stores[0] ??
      null,
    [displayView.stores, selectedStoreId]
  );
  const selectedCoupon = useMemo(() => {
    if (!selectedStore) return null;

    if (selectedCouponSelection?.storeId === selectedStore.id) {
      return (
        selectedStore.coupons.find((coupon) => coupon.id === selectedCouponSelection.couponId) ??
        selectedStore.bestCoupon
      );
    }

    return selectedStore.bestCoupon;
  }, [selectedCouponSelection, selectedStore]);
  const couponListItems = useMemo<CouponListItem[]>(
    () =>
      displayView.stores.flatMap((store) =>
        store.coupons.map((coupon, couponIndex) => ({
          store,
          coupon,
          rowId: couponIndex === 0 ? `store-${store.id}` : undefined,
          key: `${store.id}:${coupon.id}:${couponIndex}`,
        }))
      ),
    [displayView.stores]
  );
  const activeStoreId = selectedStore?.id ?? null;
  const markerDataKey = useMemo(
    () => displayView.stores.map((store) => `${store.id}:${store.lat},${store.lng}`).join('|'),
    [displayView.stores]
  );
  const emptyDescription =
    loadMessage ?? formatNearbyEmptyMessage(searchRadiusMeters);
  const showFallbackPins = mapProviderStatus !== 'loading';
  const panelToggleLabel = isCouponPanelOpen ? '쿠폰 패널 닫기' : '쿠폰 패널 열기';

  const suppressViewportReload = useCallback(() => {
    viewportReloadSuppressedUntilRef.current =
      Date.now() + MAP_PROGRAMMATIC_MOVE_SUPPRESSION_MS;
  }, []);

  const scheduleMarkerProjection = useCallback(() => {
    if (markerFrameRef.current !== null) return;

    markerFrameRef.current = window.requestAnimationFrame(() => {
      markerFrameRef.current = null;

      const map = mapRef.current;
      const kakaoMaps = kakaoMapsRef.current;
      if (!map || !kakaoMaps) return;

      const projection = map.getProjection();
      const nextPoints: Record<string, MarkerScreenPoint> = {};

      for (const store of storesRef.current) {
        nextPoints[store.id] = projection.containerPointFromCoords(
          new kakaoMaps.LatLng(store.lat, store.lng)
        );
      }

      setMarkerPoints(nextPoints);
      const coords = userCoordsRef.current;
      setLocationPoint(
        projection.containerPointFromCoords(new kakaoMaps.LatLng(coords.lat, coords.lng))
      );
    });
  }, []);

  const fitStoreBounds = useCallback(() => {
    const map = mapRef.current;
    const kakaoMaps = kakaoMapsRef.current;
    if (!map || !kakaoMaps) return;

    const stores = storesRef.current;
    const coords = userCoordsRef.current;
    const userLatLng = new kakaoMaps.LatLng(coords.lat, coords.lng);
    const centerStore = stores[0];

    if (stores.length === 0 || !centerStore) {
      suppressViewportReload();
      map.setCenter(userLatLng);
      map.setLevel(4);
      scheduleMarkerProjection();
      return;
    }

    if (
      stores.length === 1 &&
      haversineMeters(coords.lat, coords.lng, centerStore.lat, centerStore.lng) < 20
    ) {
      suppressViewportReload();
      map.setCenter(userLatLng);
      map.setLevel(4);
      scheduleMarkerProjection();
      return;
    }

    const bounds = new kakaoMaps.LatLngBounds();
    bounds.extend(userLatLng);
    for (const store of stores) {
      bounds.extend(new kakaoMaps.LatLng(store.lat, store.lng));
    }

    suppressViewportReload();
    map.setBounds(bounds, ...getMapPadding(isCouponPanelOpen));
    scheduleMarkerProjection();
  }, [isCouponPanelOpen, scheduleMarkerProjection, suppressViewportReload]);

  const reloadNearbyCoupons = useCallback(
    async (
      center: Coords,
      options: { force?: boolean; radiusMeters?: number } = {}
    ) => {
      const radiusMeters = options.radiusMeters ?? searchRadiusRef.current;
      const previousSearch = lastLoadedSearchRef.current;
      const distanceFromLastLoad = haversineMeters(
        previousSearch.center.lat,
        previousSearch.center.lng,
        center.lat,
        center.lng
      );

      setSearchRadiusMeters(radiusMeters);

      if (
        !options.force &&
        previousSearch.radiusMeters === radiusMeters &&
        distanceFromLastLoad < LOCATION_RELOAD_THRESHOLD_METERS
      ) {
        return;
      }

      activeRequestRef.current?.abort();
      const cacheKey = makeCouponRequestCacheKey(center, radiusMeters);
      const cachedResponse = options.force
        ? null
        : readCachedCouponResponse(reloadCacheRef.current, cacheKey, Date.now());

      if (cachedResponse) {
        setDisplayView(cachedResponse.view);
        setLoadStatus(cachedResponse.status);
        setLoadMessage(cachedResponse.message);
        setSearchRadiusMeters(radiusMeters);
        lastLoadedSearchRef.current = { center, radiusMeters };
        return;
      }

      const request = new AbortController();
      activeRequestRef.current = request;

      try {
        const params = new URLSearchParams({
          lat: String(center.lat),
          lng: String(center.lng),
          radiusMeters: String(radiusMeters),
        });
        const response = await fetch(`/api/coupon-map?${params.toString()}`, {
          signal: request.signal,
        });

        if (!response.ok) {
          throw new Error(`Failed to reload coupons: HTTP ${response.status}`);
        }

        const nextState = (await response.json()) as CouponMapApiResponse;
        setDisplayView(nextState.view);
        setLoadStatus(nextState.status);
        setLoadMessage(nextState.message);
        setSearchRadiusMeters(radiusMeters);
        lastLoadedSearchRef.current = { center, radiusMeters };
        writeCachedCouponResponse(
          reloadCacheRef.current,
          cacheKey,
          nextState,
          Date.now()
        );
      } catch (error) {
        if (isAbortError(error)) return;
        setLoadStatus('error');
        setLoadMessage('쿠폰 데이터를 새로 불러오지 못했습니다.');
      } finally {
        if (activeRequestRef.current === request) {
          activeRequestRef.current = null;
        }
      }
    },
    []
  );

  const reloadForMapViewport = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    const center = map.getCenter();
    void reloadNearbyCoupons(
      { lat: center.getLat(), lng: center.getLng() },
      { radiusMeters: radiusMetersForMapLevel(map.getLevel()) }
    );
  }, [reloadNearbyCoupons]);

  const scheduleViewportReload = useCallback(() => {
    scheduleMarkerProjection();

    if (viewportReloadTimeoutRef.current !== null) {
      window.clearTimeout(viewportReloadTimeoutRef.current);
      viewportReloadTimeoutRef.current = null;
    }

    if (Date.now() < viewportReloadSuppressedUntilRef.current) {
      return;
    }

    if (!hasUserMapInteractionRef.current) {
      return;
    }

    viewportReloadTimeoutRef.current = window.setTimeout(() => {
      viewportReloadTimeoutRef.current = null;
      hasUserMapInteractionRef.current = false;
      reloadForMapViewport();
    }, MAP_RELOAD_DEBOUNCE_MS);
  }, [reloadForMapViewport, scheduleMarkerProjection]);

  useEffect(() => {
    if (userLocation.isLoading) return;
    void reloadNearbyCoupons(userLocation.coords, {
      radiusMeters: searchRadiusRef.current,
    });
  }, [reloadNearbyCoupons, userLocation.coords, userLocation.isLoading]);

  useEffect(() => {
    return () => {
      activeRequestRef.current?.abort();
      if (viewportReloadTimeoutRef.current !== null) {
        window.clearTimeout(viewportReloadTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    writeCachedCouponResponse(
      reloadCacheRef.current,
      makeCouponRequestCacheKey(DEFAULT_LOCATION, DEFAULT_RADIUS_METERS),
      { view, status, message },
      Date.now()
    );
  }, [message, status, view]);

  useEffect(() => {
    if (displayView.stores.length === 0) {
      setSelectedStoreId(null);
      setSelectedCouponSelection(null);
      return;
    }

    if (!displayView.stores.some((store) => store.id === selectedStoreId)) {
      setSelectedStoreId(displayView.stores[0].id);
      setSelectedCouponSelection(null);
    }
  }, [displayView.stores, selectedStoreId]);

  useEffect(() => {
    if (!selectedCouponSelection) return;

    const store = displayView.stores.find(
      (candidate) => candidate.id === selectedCouponSelection.storeId
    );
    if (!store?.coupons.some((coupon) => coupon.id === selectedCouponSelection.couponId)) {
      setSelectedCouponSelection(null);
    }
  }, [displayView.stores, selectedCouponSelection]);

  useEffect(() => {
    if (!KAKAO_MAP_APP_KEY) {
      setMapProviderStatus('missing-key');
      return;
    }

    let isActive = true;
    let listeners: KakaoMapListener[] = [];
    let createdMap: KakaoMap | null = null;
    let interactionContainer: HTMLElement | null = null;
    let markUserMapInteraction: (() => void) | null = null;

    loadKakaoMaps(KAKAO_MAP_APP_KEY)
      .then((kakaoMaps) => {
        if (!isActive || !mapContainerRef.current) return;

        kakaoMapsRef.current = kakaoMaps;

        const centerStore = storesRef.current[0];
        const coords = userCoordsRef.current;
        const center = new kakaoMaps.LatLng(
          centerStore?.lat ?? coords.lat ?? DEFAULT_CENTER.lat,
          centerStore?.lng ?? coords.lng ?? DEFAULT_CENTER.lng
        );
        const map = new kakaoMaps.Map(mapContainerRef.current, {
          center,
          level: storesRef.current.length > 1 ? 5 : 4,
          scrollwheel: true,
          tileAnimation: true,
        });

        createdMap = map;
        mapRef.current = map;
        setMapProviderStatus('ready');
        interactionContainer = mapContainerRef.current;
        markUserMapInteraction = () => {
          hasUserMapInteractionRef.current = true;
        };

        interactionContainer?.addEventListener('pointerdown', markUserMapInteraction);
        interactionContainer?.addEventListener('wheel', markUserMapInteraction, {
          passive: true,
        });

        listeners = [
          { target: map, eventName: 'bounds_changed', handler: scheduleMarkerProjection },
          { target: map, eventName: 'zoom_changed', handler: scheduleMarkerProjection },
          { target: map, eventName: 'idle', handler: scheduleViewportReload },
        ];
        for (const listener of listeners) {
          kakaoMaps.event.addListener(listener.target, listener.eventName, listener.handler);
        }

        window.requestAnimationFrame(() => {
          if (!isActive) return;
          map.relayout();
          fitStoreBounds();
        });
      })
      .catch(() => {
        if (isActive) setMapProviderStatus('error');
      });

    return () => {
      isActive = false;

      if (markerFrameRef.current !== null) {
        window.cancelAnimationFrame(markerFrameRef.current);
        markerFrameRef.current = null;
      }

      const kakaoMaps = kakaoMapsRef.current;
      if (kakaoMaps) {
        for (const listener of listeners) {
          kakaoMaps.event.removeListener(listener.target, listener.eventName, listener.handler);
        }
      }

      if (interactionContainer && markUserMapInteraction) {
        interactionContainer.removeEventListener('pointerdown', markUserMapInteraction);
        interactionContainer.removeEventListener('wheel', markUserMapInteraction);
      }

      if (createdMap && mapRef.current === createdMap) {
        mapRef.current = null;
        if (mapContainerRef.current) mapContainerRef.current.innerHTML = '';
      }
    };
  }, [fitStoreBounds, scheduleMarkerProjection, scheduleViewportReload]);

  useEffect(() => {
    if (mapProviderStatus !== 'ready') return;
    scheduleMarkerProjection();
  }, [
    mapProviderStatus,
    markerDataKey,
    scheduleMarkerProjection,
    userLocation.coords.lat,
    userLocation.coords.lng,
  ]);

  useEffect(() => {
    if (mapProviderStatus !== 'ready') return;

    const handleResize = () => {
      mapRef.current?.relayout();
      scheduleMarkerProjection();
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [mapProviderStatus, scheduleMarkerProjection]);

  useEffect(() => {
    if (mapProviderStatus !== 'ready') return;

    const timeout = window.setTimeout(() => {
      mapRef.current?.relayout();
      scheduleMarkerProjection();
    }, 240);

    return () => window.clearTimeout(timeout);
  }, [
    isCouponPanelOpen,
    isCouponSheetExpanded,
    isCouponSheetLowered,
    mapProviderStatus,
    scheduleMarkerProjection,
  ]);

  const selectStore = useCallback(
    (storeId: string) => {
      setSelectedStoreId(storeId);
      setSelectedCouponSelection(null);
      setIsCouponPanelOpen(true);
      setIsCouponSheetLowered(false);
      setIsCouponSheetExpanded(false);

      const store = displayView.stores.find((candidate) => candidate.id === storeId);
      const map = mapRef.current;
      const kakaoMaps = kakaoMapsRef.current;
      if (!store || !map || !kakaoMaps) return;

      suppressViewportReload();
      map.panTo(new kakaoMaps.LatLng(store.lat, store.lng));
      scheduleMarkerProjection();
    },
    [displayView.stores, scheduleMarkerProjection, suppressViewportReload]
  );

  const selectCoupon = useCallback(
    (storeId: string, couponId: string) => {
      selectStore(storeId);
      setSelectedCouponSelection({ storeId, couponId });
    },
    [selectStore]
  );

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

  const moveCouponSheetDrag = useCallback((event: React.PointerEvent<HTMLElement>) => {
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
  }, [isCouponSheetExpanded, isCouponSheetLowered]);

  const finishCouponSheetDrag = useCallback((event: React.PointerEvent<HTMLElement>) => {
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
  }, [isCouponSheetExpanded, isCouponSheetLowered]);

  const lowerExpandedSheetFromMap = useCallback((event: React.MouseEvent<HTMLElement>) => {
    if (!isCouponPanelOpen || !isCouponSheetExpanded || !isMobileCouponSheet()) return;
    if (event.target instanceof Element && event.target.closest('.marker')) return;

    setIsCouponSheetExpanded(false);
    setIsCouponSheetLowered(true);
    setSheetDragY(0);
  }, [isCouponPanelOpen, isCouponSheetExpanded]);

  return (
    <main className="appShell">
      <section
        className={`mapCanvas ${mapProviderStatus === 'ready' ? 'hasProviderMap' : 'usesFallbackMap'} ${mapProviderStatus === 'loading' ? 'isMapLoading' : ''}`}
        aria-label="coupon map"
        onClick={lowerExpandedSheetFromMap}
      >
        <div ref={mapContainerRef} className="providerMap" aria-hidden="true" />
        {mapProviderStatus !== 'ready' ? <MapStatusOverlay status={mapProviderStatus} /> : null}
        <div className="mapSoftLayer" />
        {showFallbackPins ? (
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
        ) : null}

        {displayView.stores.length === 0 ? (
          <div className="empty">
            <strong>표시할 쿠폰이 없습니다</strong>
            <span>{emptyDescription}</span>
          </div>
        ) : showFallbackPins ? (
          displayView.stores.map((store) => (
            <button
              key={store.id}
              type="button"
              className={`marker ${store.id === activeStoreId ? 'selected' : ''}`}
              style={{
                '--pin-x': `${store.markerX}%`,
                '--pin-y': `${store.markerY}%`,
                '--pin-mobile-x': `${16 + store.markerX * 0.68}%`,
                '--pin-mobile-y': `${18 + store.markerY * 0.28}%`,
                '--brand-color': store.brandColor,
                ...(markerPoints[store.id]
                  ? {
                      '--pin-x': `${markerPoints[store.id].x}px`,
                      '--pin-y': `${markerPoints[store.id].y}px`,
                      '--pin-mobile-x': `${markerPoints[store.id].x}px`,
                      '--pin-mobile-y': `${markerPoints[store.id].y}px`,
                    }
                  : {}),
              } as React.CSSProperties}
              aria-label={`${store.brandName} ${store.name} ${store.bestCoupon.headline}`}
              aria-pressed={store.id === activeStoreId}
              aria-controls={`store-${store.id}`}
              onClick={() => selectStore(store.id)}
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
          ))
        ) : null}
      </section>

      {loadMessage && displayView.stores.length > 0 ? (
        <p className={`notice ${loadStatus}`}>{loadMessage}</p>
      ) : null}

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
          onClick={toggleCouponPanel}
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
                onPointerDown={startCouponSheetDrag}
                onPointerMove={moveCouponSheetDrag}
                onPointerUp={finishCouponSheetDrag}
                onPointerCancel={finishCouponSheetDrag}
              >
                <div className="sheetHandle" aria-hidden="true" />
                <div className="panelHeader">
                  <div>
                    <p className="eyebrow">CouponMap</p>
                    <h1>근처 쿠폰 매장</h1>
                  </div>
                  <div className="stats" aria-label="coupon summary">
                    <span>{displayView.totals.brands} brands</span>
                    <span>{displayView.totals.stores} stores</span>
                    <span>{displayView.totals.activeCoupons} coupons</span>
                  </div>
                </div>
              </div>

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
                    onSelect={() => selectCoupon(item.store.id, item.coupon.id)}
                  />
                ))}
              </div>
            </>
          ) : null}
        </aside>
      </div>

      <style dangerouslySetInnerHTML={{ __html: styles }} />
    </main>
  );
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function formatNearbyEmptyMessage(radiusMeters: number): string {
  return `현재 위치 ${formatRadiusLabel(radiusMeters)} 반경에 표시할 쿠폰 매장이 없습니다.`;
}

function formatDistanceLabel(distanceMeters: number): string {
  if (distanceMeters >= 1000) {
    return `${Number((distanceMeters / 1000).toFixed(1)).toLocaleString('ko-KR')}km`;
  }

  return `${Math.max(0, Math.round(distanceMeters)).toLocaleString('ko-KR')}m`;
}

function formatRadiusLabel(radiusMeters: number): string {
  return radiusMeters >= 1000
    ? `${Number((radiusMeters / 1000).toFixed(1)).toLocaleString('ko-KR')}km`
    : `${Math.round(radiusMeters).toLocaleString('ko-KR')}m`;
}

function makeCouponRequestCacheKey(center: Coords, radiusMeters: number): string {
  return `${center.lat.toFixed(4)},${center.lng.toFixed(4)},${Math.round(radiusMeters)}`;
}

function readCachedCouponResponse(
  cache: Map<string, CachedCouponMapApiResponse>,
  key: string,
  now: number
): CouponMapApiResponse | null {
  const cached = cache.get(key);
  if (!cached) return null;
  if (cached.expiresAt <= now) {
    cache.delete(key);
    return null;
  }

  return cached.response;
}

function writeCachedCouponResponse(
  cache: Map<string, CachedCouponMapApiResponse>,
  key: string,
  response: CouponMapApiResponse,
  now: number
) {
  cache.set(key, {
    response,
    expiresAt: now + COUPON_RELOAD_CACHE_TTL_MS,
  });

  while (cache.size > COUPON_RELOAD_CACHE_MAX_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (typeof oldestKey !== 'string') return;
    cache.delete(oldestKey);
  }
}

function loadKakaoMaps(appKey: string): Promise<KakaoMapsNamespace> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Kakao Maps SDK can only load in the browser.'));
  }

  const loadedMaps = window.kakao?.maps;
  if (loadedMaps?.Map) return Promise.resolve(loadedMaps);
  if (window.__couponMapKakaoLoader) return window.__couponMapKakaoLoader;

  window.__couponMapKakaoLoader = new Promise((resolve, reject) => {
    const finish = () => {
      const maps = window.kakao?.maps;
      if (!maps?.load) {
        reject(new Error('Kakao Maps SDK did not expose kakao.maps.load.'));
        return;
      }

      maps.load(() => resolve(maps));
    };

    const existingScript = document.getElementById(KAKAO_MAP_SCRIPT_ID);
    if (existingScript) {
      if (window.kakao?.maps?.load) {
        finish();
        return;
      }

      existingScript.addEventListener('load', finish, { once: true });
      existingScript.addEventListener(
        'error',
        () => reject(new Error('Failed to load Kakao Maps SDK.')),
        { once: true }
      );
      return;
    }

    const script = document.createElement('script');
    script.id = KAKAO_MAP_SCRIPT_ID;
    script.async = true;
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(
      appKey
    )}&autoload=false`;
    script.onload = finish;
    script.onerror = () => reject(new Error('Failed to load Kakao Maps SDK.'));
    document.head.appendChild(script);
  });

  return window.__couponMapKakaoLoader;
}

function getMapPadding(isCouponPanelOpen: boolean): [number, number, number, number] {
  if (typeof window === 'undefined') {
    return isCouponPanelOpen ? [92, 460, 40, 32] : [92, 32, 40, 32];
  }

  if (isMobileCouponSheet()) {
    const bottomPanelPadding = isCouponPanelOpen
      ? Math.min(Math.round(window.innerHeight * 0.74) + 28, 660)
      : 24;
    return [96, 24, bottomPanelPadding, 24];
  }

  return isCouponPanelOpen ? [92, 460, 40, 32] : [92, 32, 40, 32];
}

function isMobileCouponSheet(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(max-width: 760px)').matches
  );
}

function getPointerY(event: React.PointerEvent<HTMLElement>): number {
  const candidates = [
    event.pageY,
    event.nativeEvent.pageY,
    event.clientY,
    event.nativeEvent.clientY,
  ];
  return candidates.find((value) => Number.isFinite(value)) ?? 0;
}

function resolveCouponSheetDragY(
  rawDragY: number,
  state: { isExpanded: boolean; isLowered: boolean }
): number {
  if (state.isExpanded) {
    return Math.min(COUPON_SHEET_DRAG_LIMIT_PX, Math.max(0, rawDragY));
  }

  if (state.isLowered) {
    return Math.max(-COUPON_SHEET_DRAG_LIMIT_PX, Math.min(0, rawDragY));
  }

  return Math.max(
    -COUPON_SHEET_DRAG_LIMIT_PX,
    Math.min(COUPON_SHEET_DRAG_LIMIT_PX, rawDragY)
  );
}

function CouponListRow({
  rowId,
  store,
  coupon,
  isSelected,
  onSelect,
}: {
  rowId?: string;
  store: CouponMapStore;
  coupon: CouponMapCoupon;
  isSelected: boolean;
  onSelect: () => void;
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
      onClick={onSelect}
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
}

function BrandLogo({
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

  return {
    kind: 'default',
    label: store.brandInitial,
    background: store.brandColor,
  };
}

function MapStatusOverlay({ status }: { status: MapProviderStatus }) {
  const label = formatMapStatusLabel(status);

  return (
    <div className={`mapStatus mapStatus-${status}`} role={status === 'loading' ? 'status' : 'note'}>
      {status === 'loading' ? <span className="mapStatusSpinner" aria-hidden="true" /> : null}
      <span>{label}</span>
    </div>
  );
}

function formatMapStatusLabel(status: MapProviderStatus): string {
  if (status === 'missing-key') return '지도 키가 설정되지 않았습니다';
  if (status === 'error') return '지도를 불러오지 못했습니다';
  return '지도를 준비 중입니다';
}

function ArrowIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M3 8h9M8.6 4.2 12.5 8l-3.9 3.8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PanelToggleIcon() {
  return (
    <svg className="panelToggleIcon" width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M7.5 4.5 12.5 10l-5 5.5"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const styles = `
  * {
    box-sizing: border-box;
  }

  html,
  body {
    margin: 0;
    min-height: 100%;
    background: #ecebe7;
  }

  body {
    color: #15151a;
    font-family: Pretendard, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    -webkit-font-smoothing: antialiased;
  }

  button {
    font: inherit;
  }

  h1,
  h2,
  h3,
  p {
    margin: 0;
  }

  .appShell {
    position: relative;
    min-height: 100dvh;
    overflow: hidden;
    background: #ecebe7;
  }

  .mapCanvas {
    position: fixed;
    inset: 0;
    overflow: hidden;
    background: #f3f2ee;
  }

  .mapCanvas::before {
    position: absolute;
    z-index: 0;
    inset: 0;
    background:
      linear-gradient(180deg, rgba(255,255,255,.44), rgba(255,255,255,0) 42%),
      #f3f2ee;
    content: "";
  }

  .isMapLoading::after {
    position: absolute;
    z-index: 2;
    inset: 0;
    background: linear-gradient(105deg, transparent 30%, rgba(255,255,255,.58) 48%, transparent 66%);
    content: "";
    animation: mapLoadingSweep 1.8s ease-in-out infinite;
    transform: translateX(-100%);
  }

  .providerMap {
    position: absolute;
    z-index: 1;
    inset: 0;
    width: 100%;
    height: 100%;
    opacity: 0;
    pointer-events: none;
    transition: opacity .2s ease;
  }

  .hasProviderMap .providerMap {
    opacity: 1;
    pointer-events: auto;
  }

  .mapStatus {
    position: absolute;
    z-index: 6;
    left: 50%;
    top: 42%;
    display: inline-flex;
    align-items: center;
    gap: 9px;
    min-height: 40px;
    transform: translate(-50%, -50%);
    border: 1px solid rgba(21,21,26,.08);
    border-radius: 999px;
    padding: 0 14px;
    background: rgba(255,255,255,.92);
    color: #46464f;
    font-size: 13px;
    font-weight: 900;
    box-shadow: 0 12px 30px rgba(20,20,30,.1);
    white-space: nowrap;
  }

  .mapStatus-error,
  .mapStatus-missing-key {
    color: #5b5b63;
  }

  .mapStatusSpinner {
    width: 14px;
    height: 14px;
    border: 2px solid rgba(245,64,44,.22);
    border-top-color: #f5402c;
    border-radius: 50%;
    animation: mapStatusSpin .7s linear infinite;
  }

  .mapSoftLayer {
    position: absolute;
    z-index: 4;
    inset: 0;
    background:
      linear-gradient(180deg, rgba(255,255,255,.14), rgba(255,255,255,0) 34%),
      radial-gradient(circle at 18% 18%, rgba(255,255,255,.38), transparent 28%);
    pointer-events: none;
  }

  @keyframes mapLoadingSweep {
    to {
      transform: translateX(100%);
    }
  }

  @keyframes mapStatusSpin {
    to {
      transform: rotate(360deg);
    }
  }

  .notice {
    position: fixed;
    z-index: 50;
    top: 18px;
    left: 18px;
    width: min(420px, calc(100vw - 36px));
    border: 1px solid #f5d565;
    border-radius: 8px;
    padding: 10px 12px;
    background: #fff8d8;
    color: #5f4700;
    font-size: 13px;
    font-weight: 800;
    box-shadow: 0 10px 24px rgba(20,20,30,.1);
  }

  .notice.error {
    border-color: #fecdca;
    background: #fffbfa;
    color: #b42318;
  }

  .myLocation {
    position: absolute;
    z-index: 5;
    left: var(--user-x, 50%);
    top: var(--user-y, 50%);
    width: 46px;
    height: 46px;
    transform: translate(-50%, -50%);
    border-radius: 50%;
    background: rgba(46,118,255,.12);
    pointer-events: none;
  }

  .myLocation::before {
    position: absolute;
    inset: 10px;
    border-radius: 50%;
    background: rgba(46,118,255,.2);
    content: "";
  }

  .myLocation span {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 14px;
    height: 14px;
    transform: translate(-50%, -50%);
    border: 3px solid #fff;
    border-radius: 50%;
    background: #2e76ff;
    box-shadow: 0 2px 8px rgba(20,20,30,.22);
  }

  .marker {
    position: absolute;
    z-index: 20;
    left: var(--pin-x);
    top: var(--pin-y);
    display: flex;
    flex-direction: column;
    align-items: center;
    transform: translate(-50%, -100%);
    border: 0;
    padding: 0;
    background: transparent;
    color: #15151a;
    cursor: pointer;
    transition: opacity .16s ease, transform .16s ease;
  }

  .pinBubble {
    display: flex;
    align-items: center;
    gap: 7px;
    min-height: 38px;
    border: 1px solid rgba(20,20,30,.08);
    border-radius: 999px;
    padding: 4px 11px 4px 4px;
    background: #fff;
    box-shadow: 0 8px 18px rgba(20,20,30,.17);
    white-space: nowrap;
    transition: border-color .16s ease, box-shadow .16s ease, transform .16s ease;
  }

  .marker.selected {
    z-index: 30;
  }

  .marker.selected .pinBubble {
    border-color: #f5402c;
    box-shadow: 0 12px 28px rgba(245,64,44,.28);
    transform: scale(1.06);
  }

  .pinLogo,
  .brandLogo,
  .storeLogo {
    display: grid;
    place-items: center;
    flex: 0 0 auto;
    background: var(--brand-color, #15151a);
    color: #fff;
    font-weight: 900;
    line-height: 1;
    letter-spacing: 0;
    white-space: nowrap;
  }

  .brandBadge[data-brand-logo="kfc"] {
    font-family: Arial, Helvetica, sans-serif;
    text-transform: uppercase;
  }

  .pinLogo {
    width: 28px;
    height: 28px;
    border-radius: 8px;
    font-size: 11px;
  }

  .pinDeal {
    display: flex;
    align-items: baseline;
    gap: 3px;
  }

  .pinDeal small,
  .couponRowDeal small {
    color: #9a9aa2;
    font-size: 10px;
    font-weight: 800;
  }

  .pinDeal b {
    color: #f5402c;
    font-size: 15px;
    font-weight: 900;
    font-variant-numeric: tabular-nums;
  }

  .pinTail {
    width: 14px;
    height: 8px;
    margin-top: -1px;
    background: #fff;
    clip-path: polygon(50% 100%, 0 0, 100% 0);
    filter: drop-shadow(0 2px 1px rgba(20,20,30,.08));
  }

  .marker:focus-visible,
  .couponListRow:focus-visible,
  .openAppButton:focus-visible,
  .panelToggle:focus-visible {
    outline: 3px solid rgba(46,118,255,.32);
    outline-offset: 3px;
  }

  .empty {
    position: absolute;
    z-index: 12;
    left: 50%;
    top: 44%;
    display: grid;
    width: min(340px, calc(100vw - 40px));
    transform: translate(-50%, -50%);
    gap: 8px;
    border: 1px solid rgba(21,21,26,.08);
    border-radius: 8px;
    padding: 18px;
    background: rgba(255,255,255,.94);
    color: #5b5b63;
    text-align: center;
    box-shadow: 0 14px 34px rgba(20,20,30,.14);
  }

  .empty strong {
    color: #15151a;
    font-size: 18px;
  }

  .panelDock {
    position: fixed;
    z-index: 35;
    top: 22px;
    right: 22px;
    bottom: 22px;
    width: min(420px, calc(100vw - 76px));
    pointer-events: none;
    transition: transform .22s ease;
  }

  .panelDock.isPanelClosed {
    transform: translateX(calc(100% + 22px));
  }

  .panelToggle {
    position: absolute;
    z-index: 3;
    top: 50%;
    left: -46px;
    display: grid;
    place-items: center;
    width: 40px;
    height: 52px;
    transform: translateY(-50%);
    border: 1px solid rgba(21,21,26,.08);
    border-radius: 8px;
    background: rgba(255,255,255,.96);
    color: #15151a;
    box-shadow: 0 12px 28px rgba(20,20,30,.16);
    cursor: pointer;
    pointer-events: auto;
  }

  .panelToggleIcon {
    transition: transform .22s ease;
  }

  .panelDock.isPanelClosed .panelToggleIcon {
    transform: rotate(180deg);
  }

  .couponPanel {
    position: absolute;
    z-index: 1;
    inset: 0;
    display: flex;
    width: 100%;
    flex-direction: column;
    overflow: hidden;
    border: 1px solid rgba(21,21,26,.08);
    border-radius: 8px;
    background: rgba(255,255,255,.97);
    box-shadow: 0 24px 60px rgba(20,20,30,.22);
    opacity: 1;
    pointer-events: auto;
    transition: opacity .16s ease;
  }

  .panelDock.isPanelClosed .couponPanel {
    opacity: 0;
    pointer-events: none;
  }

  .panelDock.isSheetDragging {
    transition: none;
  }

  .sheetDragArea {
    flex: 0 0 auto;
  }

  .sheetHandle {
    display: none;
    width: 42px;
    height: 4px;
    flex: 0 0 auto;
    border-radius: 2px;
    margin: 9px auto 0;
    background: #dbdbdf;
  }

  .panelHeader {
    display: grid;
    gap: 12px;
    flex: 0 0 auto;
    padding: 18px 18px 14px;
    border-bottom: 1px solid #ececef;
  }

  .eyebrow {
    color: #f5402c;
    font-size: 11px;
    font-weight: 900;
    letter-spacing: 0;
    text-transform: uppercase;
  }

  h1 {
    margin-top: 2px;
    color: #15151a;
    font-size: 22px;
    line-height: 1.15;
    letter-spacing: 0;
  }

  .stats {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .stats span,
  .sectionHeader span {
    border: 1px solid #ececef;
    border-radius: 999px;
    padding: 5px 8px;
    background: #f7f7f5;
    color: #5b5b63;
    font-size: 12px;
    font-weight: 800;
  }

  .selectedDetail {
    display: grid;
    gap: 12px;
    flex: 0 0 auto;
    padding: 16px 18px;
    border-bottom: 1px solid #ececef;
  }

  .selectedHead {
    display: grid;
    grid-template-columns: 50px minmax(0, 1fr) auto;
    gap: 12px;
    align-items: start;
  }

  .brandLogo {
    width: 50px;
    height: 50px;
    border-radius: 8px;
    font-size: 16px;
  }

  .brandLogo.brandBadge[data-brand-logo="kfc"] {
    width: 42px;
    height: 42px;
    font-size: 13px;
  }

  .selectedHead p {
    color: #15151a;
    font-size: 17px;
    font-weight: 900;
    letter-spacing: 0;
  }

  .selectedHead h2 {
    overflow-wrap: anywhere;
    color: #15151a;
    font-size: 15px;
    line-height: 1.3;
    letter-spacing: 0;
  }

  .selectedHead div span {
    display: block;
    margin-top: 3px;
    color: #9a9aa2;
    font-size: 13px;
    font-weight: 700;
  }

  .selectedHead strong {
    color: #f5402c;
    font-size: 22px;
    font-weight: 900;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .couponFacts {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    margin: 0;
  }

  .couponFacts div {
    display: grid;
    grid-template-columns: auto auto;
    gap: 5px;
    align-items: center;
    border: 1px solid #ececef;
    border-radius: 999px;
    padding: 5px 8px;
    background: #f7f7f5;
    font-size: 12px;
  }

  .couponFacts dt {
    color: #777780;
    font-weight: 800;
  }

  .couponFacts dd {
    margin: 0;
    color: #15151a;
    font-weight: 900;
  }

  .openAppButton {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    min-height: 52px;
    border: 0;
    border-radius: 8px;
    background: #f5402c;
    color: #fff;
    font-size: 16px;
    font-weight: 900;
    cursor: pointer;
  }

  .sectionHeader {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex: 0 0 auto;
    padding: 14px 18px 8px;
  }

  .sectionHeader h2 {
    color: #15151a;
    font-size: 15px;
    font-weight: 900;
  }

  .couponList {
    display: grid;
    flex: 1;
    align-content: start;
    overflow: auto;
    border-top: 1px solid #ececef;
  }

  .couponList::-webkit-scrollbar {
    width: 0;
    height: 0;
  }

  .couponListRow {
    display: grid;
    grid-template-columns: 42px minmax(0, 1fr) auto;
    gap: 12px;
    align-items: center;
    width: 100%;
    border: 0;
    border-bottom: 1px solid #ececef;
    padding: 14px 18px;
    background: #fff;
    color: inherit;
    cursor: pointer;
    text-align: left;
    transition: background .16s ease, box-shadow .16s ease;
  }

  .couponListRow.selected {
    background: #f7f7f5;
    box-shadow: inset 3px 0 0 #f5402c;
  }

  .storeLogo {
    width: 42px;
    height: 42px;
    border-radius: 8px;
    font-size: 13px;
  }

  .couponRowCopy {
    min-width: 0;
  }

  .couponRowTitle {
    display: flex;
    min-width: 0;
    align-items: baseline;
    gap: 6px;
  }

  .couponRowTitle h3 {
    overflow: hidden;
    color: #15151a;
    font-size: 15px;
    font-weight: 900;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .couponRowTitle span {
    flex: 0 0 auto;
    border-radius: 6px;
    padding: 2px 6px;
    background: #fff1ee;
    color: #f5402c;
    font-size: 11px;
    font-weight: 900;
    white-space: nowrap;
  }

  .couponRowCopy p,
  .couponRowCopy address {
    overflow: hidden;
    color: #5b5b63;
    font-size: 12px;
    font-style: normal;
    line-height: 1.35;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .couponRowCopy p {
    margin-top: 3px;
  }

  .couponRowDeal {
    display: grid;
    justify-items: end;
    gap: 2px;
    min-width: 72px;
  }

  .couponRowDeal strong {
    color: #f5402c;
    font-size: 18px;
    font-weight: 900;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  @media (max-width: 760px) {
    .notice {
      top: max(14px, env(safe-area-inset-top));
      left: 14px;
      width: calc(100vw - 28px);
    }

    .panelDock {
      top: auto;
      right: 0;
      bottom: 0;
      left: 0;
      width: auto;
      height: min(74dvh, 620px);
      max-height: calc(100dvh - 92px);
    }

    .panelDock.isSheetExpanded {
      height: calc(100dvh - ${COUPON_SHEET_EXPANDED_TOP_GAP_PX}px - env(safe-area-inset-top));
      max-height: calc(100dvh - ${COUPON_SHEET_EXPANDED_TOP_GAP_PX}px);
    }

    .panelDock.isPanelClosed {
      transform: translateY(100%);
    }

    .panelDock.isPanelOpen {
      transform: translateY(calc(var(--sheet-base-y, 0px) + var(--sheet-drag-y, 0px)));
    }

    .sheetDragArea {
      cursor: grab;
      touch-action: none;
    }

    .panelDock.isSheetDragging .sheetDragArea {
      cursor: grabbing;
    }

    .panelToggle {
      display: none;
      top: -56px;
      right: 14px;
      left: auto;
      width: 48px;
      height: 48px;
      transform: none;
    }

    .panelDock.isPanelOpen .panelToggleIcon {
      transform: rotate(90deg);
    }

    .panelDock.isPanelClosed .panelToggleIcon {
      transform: rotate(-90deg);
    }

    .couponPanel {
      inset: 0;
      width: 100%;
      height: 100%;
      border-right: 0;
      border-bottom: 0;
      border-left: 0;
      border-radius: 22px 22px 0 0;
      box-shadow: 0 -12px 34px rgba(20,20,30,.18);
    }

    .sheetHandle {
      display: block;
    }

    .panelHeader {
      padding: 12px 18px 12px;
    }

    h1 {
      font-size: 18px;
    }

    .stats span:nth-child(1) {
      display: none;
    }

    .selectedDetail {
      gap: 10px;
      max-height: 230px;
      overflow: auto;
      padding: 12px 18px;
    }

    .selectedHead {
      grid-template-columns: 44px minmax(0, 1fr) auto;
      gap: 10px;
    }

    .brandLogo {
      width: 44px;
      height: 44px;
      font-size: 14px;
    }

    .brandLogo.brandBadge[data-brand-logo="kfc"] {
      width: 40px;
      height: 40px;
      font-size: 13px;
    }

    .selectedHead p {
      font-size: 15px;
    }

    .selectedHead h2 {
      font-size: 14px;
    }

    .selectedHead strong {
      font-size: 18px;
    }

    .couponFacts {
      display: none;
    }

    .openAppButton {
      min-height: 46px;
      font-size: 15px;
    }

    .sectionHeader {
      padding: 12px 18px 8px;
    }

    .couponListRow {
      grid-template-columns: 40px minmax(0, 1fr) auto;
      padding: 13px 18px;
    }

    .storeLogo {
      width: 40px;
      height: 40px;
    }

    .couponRowDeal {
      min-width: 64px;
    }

    .couponRowDeal strong {
      font-size: 16px;
    }

    .marker {
      left: clamp(16vw, var(--pin-mobile-x), 84vw);
      top: clamp(92px, var(--pin-mobile-y), 42vh);
      max-width: 48vw;
    }

    .pinBubble {
      gap: 5px;
      min-height: 34px;
      padding-right: 9px;
    }

    .pinLogo {
      width: 25px;
      height: 25px;
      font-size: 10px;
    }

    .pinDeal small {
      display: none;
    }

    .pinDeal b {
      font-size: 13px;
    }
  }
`;
