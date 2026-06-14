'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useUserLocation, type UserLocationSource } from '../lib/geo';
import type { CouponMapLoadStatus, CouponMapView } from '../lib/frontendData';
import { DEFAULT_LOCATION, type Coords } from '../lib/location';
import { radiusMetersForMapViewport } from '../lib/mapScale';
import { DEFAULT_RADIUS_METERS, haversineMeters } from '../lib/stores';
import {
  type CachedCouponMapApiResponse,
  type CouponMapApiResponse,
  makeCouponRequestCacheKey,
  normalizeCouponRequestCenter,
  readCachedCouponResponse,
  writeCachedCouponResponse,
} from '../lib/couponResponseCache';
import { COUPON_SHEET_PEEK_HEIGHT_PX } from '../lib/couponSheet';
import { formatNearbyEmptyMessage } from '../lib/format';
import { cancelFrame, requestFrame } from '../lib/domFrame';
import { trackAmplitudeEvent } from '../lib/amplitude';
import {
  DEFAULT_CENTER,
  getMapPadding,
  isMobileCouponSheet,
  type KakaoLatLng,
  type KakaoMap,
  type KakaoMapListener,
  type KakaoMapsNamespace,
  loadKakaoMaps,
  type MapProviderStatus,
  readKakaoMapAppKey,
} from '../lib/kakaoMap';
import { CouponPanel, type CouponListItem } from './coupon-map/CouponPanel';
import { FeedbackDialog } from './coupon-map/FeedbackDialog';
import { LocateIcon } from './coupon-map/icons';
import { MapStatusOverlay } from './coupon-map/MapStatusOverlay';
import { MarkerLayer, type MarkerLayerHandle } from './coupon-map/MarkerLayer';
import { useCouponSheet } from './coupon-map/useCouponSheet';
import { useFeedbackForm } from './coupon-map/useFeedbackForm';

export type { CouponMapLoadStatus } from '../lib/frontendData';

interface CouponMapScreenProps {
  view: CouponMapView;
  status: CouponMapLoadStatus;
  message: string | null;
}

const LOCATION_RELOAD_THRESHOLD_METERS = 50;
const MAP_RELOAD_DEBOUNCE_MS = 500;
const MAP_PROGRAMMATIC_MOVE_SUPPRESSION_MS = 900;
const MOBILE_MAP_LEVEL_OFFSET = 1;
const DEFAULT_MAP_CONTAINER_WIDTH_PX = 800;
const DEFAULT_MAP_CONTAINER_HEIGHT_PX = 600;

interface SelectedCouponSelection {
  storeId: string;
  couponId: string;
}

type CouponSearchSource =
  | 'cache'
  | 'current_location_button'
  | 'map_viewport'
  | 'user_location_default'
  | 'user_location_geolocation'
  | 'user_location_stored';

type StoreSelectionSource = 'coupon_list' | 'map_marker';

export default function CouponMapScreen({
  view,
  status,
  message,
}: CouponMapScreenProps) {
  const kakaoMapAppKey = readKakaoMapAppKey();
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<KakaoMap | null>(null);
  const kakaoMapsRef = useRef<KakaoMapsNamespace | null>(null);
  const markerLayerRef = useRef<MarkerLayerHandle | null>(null);
  const viewportReloadTimeoutRef = useRef<number | null>(null);
  const viewportReloadSuppressedUntilRef = useRef(0);
  const hasUserMapInteractionRef = useRef(false);
  const hasAutoFocusedUserLocationRef = useRef(false);
  const pendingUserLocationMapFitRef = useRef(false);
  const skipNextUserLocationReloadRef = useRef(false);
  const fitStoreBoundsRef = useRef<() => void>(() => undefined);
  const activeRequestRef = useRef<AbortController | null>(null);
  const reloadCacheRef = useRef(new Map<string, CachedCouponMapApiResponse>());
  const lastLoadedSearchRef = useRef({
    center: DEFAULT_LOCATION,
    radiusMeters: DEFAULT_RADIUS_METERS,
  });
  const hasTrackedInitialViewRef = useRef(false);
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(
    view.stores[0]?.id ?? null
  );
  const [selectedCouponSelection, setSelectedCouponSelection] =
    useState<SelectedCouponSelection | null>(null);
  const [displayView, setDisplayView] = useState(view);
  const [loadStatus, setLoadStatus] = useState<CouponMapLoadStatus>(status);
  const [loadMessage, setLoadMessage] = useState<string | null>(message);
  const [searchRadiusMeters, setSearchRadiusMeters] = useState(DEFAULT_RADIUS_METERS);
  const [mapProviderStatus, setMapProviderStatus] = useState<MapProviderStatus>(
    kakaoMapAppKey ? 'loading' : 'missing-key'
  );
  const {
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
  } = useCouponSheet();
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
  const {
    isFeedbackOpen,
    feedbackType,
    feedbackMessage,
    feedbackContact,
    feedbackSubmitStatus,
    feedbackError,
    setFeedbackType,
    setFeedbackMessage,
    setFeedbackContact,
    openFeedback,
    closeFeedback,
    submitFeedback,
  } = useFeedbackForm({ selectedStore, selectedCoupon, searchRadiusMeters });
  const emptyDescription =
    loadMessage ?? formatNearbyEmptyMessage(searchRadiusMeters);
  const showFallbackPins = mapProviderStatus !== 'loading';
  const panelToggleLabel = isCouponPanelOpen ? '쿠폰 패널 닫기' : '쿠폰 패널 열기';
  const locateButtonLabel =
    userLocation.source === 'stored'
      ? '현재 위치 갱신'
      : userLocation.usingDefault
        ? '기본 위치로 이동'
        : '현재 위치로 이동';
  const mobileMapActionsStyle = {
    '--mobile-action-base-y': isCouponSheetLowered
      ? `calc(var(--mobile-sheet-height, 0px) - ${COUPON_SHEET_PEEK_HEIGHT_PX}px)`
      : '0px',
    '--sheet-drag-y': `${sheetDragY}px`,
  } as React.CSSProperties;

  const suppressViewportReload = useCallback(() => {
    viewportReloadSuppressedUntilRef.current =
      Date.now() + MAP_PROGRAMMATIC_MOVE_SUPPRESSION_MS;
  }, []);

  const requestMarkerReproject = useCallback(() => {
    markerLayerRef.current?.reproject();
  }, []);

  useEffect(() => {
    if (hasTrackedInitialViewRef.current) return;
    hasTrackedInitialViewRef.current = true;

    trackAmplitudeEvent('coupon_map_viewed', {
      active_coupon_count: view.totals.activeCoupons,
      initial_status: status,
      search_radius_meters: DEFAULT_RADIUS_METERS,
      store_count: view.totals.stores,
    });
  }, [status, view.totals.activeCoupons, view.totals.stores]);

  const fitStoreBounds = useCallback(() => {
    const map = mapRef.current;
    const kakaoMaps = kakaoMapsRef.current;
    if (!map || !kakaoMaps) return;

    const coords = userCoordsRef.current;
    const userLatLng = new kakaoMaps.LatLng(coords.lat, coords.lng);
    const nearbyStores = storesRef.current.filter(
      (store) =>
        haversineMeters(coords.lat, coords.lng, store.lat, store.lng) <=
        searchRadiusRef.current
    );
    const centerStore = nearbyStores[0];
    const userFocusedLevel = getAutoFitMapLevel(4);

    if (nearbyStores.length === 0 || !centerStore) {
      suppressViewportReload();
      map.setCenter(userLatLng);
      map.setLevel(userFocusedLevel);
      requestMarkerReproject();
      return;
    }

    if (
      nearbyStores.length === 1 &&
      haversineMeters(coords.lat, coords.lng, centerStore.lat, centerStore.lng) < 20
    ) {
      suppressViewportReload();
      map.setCenter(userLatLng);
      map.setLevel(userFocusedLevel);
      requestMarkerReproject();
      return;
    }

    const bounds = new kakaoMaps.LatLngBounds();
    bounds.extend(userLatLng);
    for (const store of nearbyStores) {
      bounds.extend(new kakaoMaps.LatLng(store.lat, store.lng));
    }

    suppressViewportReload();
    map.setBounds(bounds, ...getMapPadding(isCouponPanelOpen));
    if (map.getLevel() > userFocusedLevel) {
      map.setLevel(userFocusedLevel);
    }
    requestMarkerReproject();
  }, [isCouponPanelOpen, requestMarkerReproject, suppressViewportReload]);
  fitStoreBoundsRef.current = fitStoreBounds;

  const recenterDesktopPanelFocus = useCallback(
    (nextIsCouponPanelOpen: boolean) => {
      const map = mapRef.current;
      const kakaoMaps = kakaoMapsRef.current;
      if (!map || !kakaoMaps || isMobileCouponSheet()) return;

      const focusLatLng = getCurrentDesktopMapFocus(
        map,
        kakaoMaps,
        mapContainerRef.current,
        isCouponPanelOpen
      );

      suppressViewportReload();
      requestFrame(() => {
        map.relayout();
        map.panTo(
          getDesktopFocusedMapCenter(
            focusLatLng,
            map,
            kakaoMaps,
            mapContainerRef.current,
            nextIsCouponPanelOpen
          )
        );
        requestMarkerReproject();
      });
    },
    [isCouponPanelOpen, requestMarkerReproject, suppressViewportReload]
  );

  const handleToggleCouponPanel = useCallback(() => {
    recenterDesktopPanelFocus(!isCouponPanelOpen);
    toggleCouponPanel();
  }, [isCouponPanelOpen, recenterDesktopPanelFocus, toggleCouponPanel]);

  const reloadNearbyCoupons = useCallback(
    async (
      center: Coords,
      options: {
        force?: boolean;
        radiusMeters?: number;
        selectFirstStore?: boolean;
        source?: CouponSearchSource;
      } = {}
    ) => {
      const radiusMeters = options.radiusMeters ?? searchRadiusRef.current;
      const previousSearch = lastLoadedSearchRef.current;
      const distanceFromLastLoad = haversineMeters(
        previousSearch.center.lat,
        previousSearch.center.lng,
        center.lat,
        center.lng
      );

      if (
        !options.force &&
        previousSearch.radiusMeters === radiusMeters &&
        distanceFromLastLoad < LOCATION_RELOAD_THRESHOLD_METERS
      ) {
        return;
      }

      setSearchRadiusMeters(radiusMeters);

      activeRequestRef.current?.abort();
      const requestCenter = normalizeCouponRequestCenter(center);
      const cacheKey = makeCouponRequestCacheKey(requestCenter, radiusMeters);
      const cachedResponse = options.force
        ? null
        : readCachedCouponResponse(reloadCacheRef.current, cacheKey, Date.now());

      if (cachedResponse) {
        setDisplayView(cachedResponse.view);
        setLoadStatus(cachedResponse.status);
        setLoadMessage(cachedResponse.message);
        setSearchRadiusMeters(radiusMeters);
        if (options.selectFirstStore) {
          setSelectedStoreId(cachedResponse.view.stores[0]?.id ?? null);
          setSelectedCouponSelection(null);
        }
        lastLoadedSearchRef.current = { center, radiusMeters };
        trackCouponSearchLoaded('cache', radiusMeters, cachedResponse);
        return;
      }

      const request = new AbortController();
      activeRequestRef.current = request;

      try {
        const params = new URLSearchParams({
          lat: String(requestCenter.lat),
          lng: String(requestCenter.lng),
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
        if (options.selectFirstStore) {
          setSelectedStoreId(nextState.view.stores[0]?.id ?? null);
          setSelectedCouponSelection(null);
        }
        lastLoadedSearchRef.current = { center, radiusMeters };
        writeCachedCouponResponse(
          reloadCacheRef.current,
          cacheKey,
          nextState,
          Date.now()
        );
        trackCouponSearchLoaded(options.source ?? 'map_viewport', radiusMeters, nextState);
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
      {
        radiusMeters: radiusMetersForMapViewport(map),
        source: 'map_viewport',
      }
    );
  }, [reloadNearbyCoupons]);

  const scheduleViewportReload = useCallback(() => {
    requestMarkerReproject();

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
  }, [reloadForMapViewport, requestMarkerReproject]);

  useEffect(() => {
    if (userLocation.isLoading) return;
    if (skipNextUserLocationReloadRef.current) {
      skipNextUserLocationReloadRef.current = false;
      return;
    }

    const shouldFocusUserLocation =
      userLocation.source === 'geolocation' && !hasAutoFocusedUserLocationRef.current;

    if (shouldFocusUserLocation) {
      hasAutoFocusedUserLocationRef.current = true;
    }

    void reloadNearbyCoupons(userLocation.coords, {
      radiusMeters: searchRadiusRef.current,
      selectFirstStore: shouldFocusUserLocation,
      source: getUserLocationSearchSource(userLocation.source),
    }).then(() => {
      if (!shouldFocusUserLocation) return;
      pendingUserLocationMapFitRef.current = true;
      requestFrame(() => {
        if (!pendingUserLocationMapFitRef.current) return;
        fitStoreBoundsRef.current();
        if (mapRef.current) pendingUserLocationMapFitRef.current = false;
      });
    });
  }, [
    reloadNearbyCoupons,
    userLocation.coords,
    userLocation.isLoading,
    userLocation.source,
    userLocation.usingDefault,
  ]);

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
    if (!kakaoMapAppKey) {
      setMapProviderStatus('missing-key');
      return;
    }

    let isActive = true;
    let listeners: KakaoMapListener[] = [];
    let createdMap: KakaoMap | null = null;
    let interactionContainer: HTMLElement | null = null;
    let markUserMapInteraction: (() => void) | null = null;

    loadKakaoMaps(kakaoMapAppKey)
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
          level: getAutoFitMapLevel(storesRef.current.length > 1 ? 5 : 4),
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
          { target: map, eventName: 'idle', handler: scheduleViewportReload },
        ];
        for (const listener of listeners) {
          kakaoMaps.event.addListener(listener.target, listener.eventName, listener.handler);
        }

        window.requestAnimationFrame(() => {
          if (!isActive) return;
          map.relayout();
          fitStoreBoundsRef.current();
        });
      })
      .catch(() => {
        if (isActive) setMapProviderStatus('error');
      });

    return () => {
      isActive = false;

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
  }, [kakaoMapAppKey, scheduleViewportReload]);

  useEffect(() => {
    if (mapProviderStatus !== 'ready') return;
    if (!pendingUserLocationMapFitRef.current) return;

    const frame = requestFrame(() => {
      if (!pendingUserLocationMapFitRef.current) return;
      fitStoreBounds();
      pendingUserLocationMapFitRef.current = false;
    });

    return () => cancelFrame(frame);
  }, [displayView.stores, fitStoreBounds, mapProviderStatus]);

  useEffect(() => {
    if (mapProviderStatus !== 'ready') return;

    const handleResize = () => {
      mapRef.current?.relayout();
      requestMarkerReproject();
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [mapProviderStatus, requestMarkerReproject]);

  useEffect(() => {
    if (mapProviderStatus !== 'ready') return;

    const timeout = window.setTimeout(() => {
      mapRef.current?.relayout();
      requestMarkerReproject();
    }, 240);

    return () => window.clearTimeout(timeout);
  }, [
    isCouponPanelOpen,
    isCouponSheetLowered,
    mapProviderStatus,
    requestMarkerReproject,
  ]);

  const selectStore = useCallback(
    (storeId: string, source: StoreSelectionSource = 'map_marker') => {
      setSelectedStoreId(storeId);
      setSelectedCouponSelection(null);
      openPanelForSelection();

      const store = displayView.stores.find((candidate) => candidate.id === storeId);
      if (store) {
        trackAmplitudeEvent('coupon_store_selected', {
          best_coupon_id: store.bestCoupon.id,
          brand_id: store.brand.id,
          brand_name: store.brandName,
          coupon_count: store.coupons.length,
          source,
          store_id: store.id,
        });
      }

      const map = mapRef.current;
      const kakaoMaps = kakaoMapsRef.current;
      if (!store || !map || !kakaoMaps) return;

      const storeLatLng = new kakaoMaps.LatLng(store.lat, store.lng);

      suppressViewportReload();
      map.panTo(
        getFocusedMapCenter(storeLatLng, map, kakaoMaps, mapContainerRef.current, {
          isCouponPanelOpen: true,
        })
      );
      requestMarkerReproject();
    },
    [displayView.stores, openPanelForSelection, requestMarkerReproject, suppressViewportReload]
  );

  const selectCoupon = useCallback(
    (storeId: string, couponId: string) => {
      selectStore(storeId, 'coupon_list');
      const store = displayView.stores.find((candidate) => candidate.id === storeId);
      const coupon = store?.coupons.find((candidate) => candidate.id === couponId);
      if (store && coupon) {
        trackAmplitudeEvent('coupon_selected', {
          brand_id: store.brand.id,
          brand_name: store.brandName,
          coupon_id: coupon.id,
          discount_type: coupon.discountType,
          source: 'coupon_list',
          store_id: store.id,
        });
      }
      setSelectedCouponSelection({ storeId, couponId });
    },
    [displayView.stores, selectStore]
  );

  const returnToUserLocation = useCallback(async () => {
    let coords = userCoordsRef.current;
    if (userLocation.source === 'stored') {
      const refreshedCoords = await userLocation.requestCurrentLocation();
      if (!refreshedCoords) return;
      coords = refreshedCoords;
      skipNextUserLocationReloadRef.current = true;
    }

    const map = mapRef.current;
    const kakaoMaps = kakaoMapsRef.current;
    const radiusMeters = map
      ? radiusMetersForMapViewport(map)
      : searchRadiusRef.current;

    collapseSheet();
    void reloadNearbyCoupons(coords, {
      force: true,
      radiusMeters,
      selectFirstStore: true,
      source: 'current_location_button',
    });

    if (!map || !kakaoMaps) return;

    suppressViewportReload();
    map.panTo(
      getFocusedMapCenter(
        new kakaoMaps.LatLng(coords.lat, coords.lng),
        map,
        kakaoMaps,
        mapContainerRef.current,
        { isCouponPanelOpen }
      )
    );
    requestMarkerReproject();
  }, [
    collapseSheet,
    isCouponPanelOpen,
    reloadNearbyCoupons,
    requestMarkerReproject,
    suppressViewportReload,
    userLocation.requestCurrentLocation,
    userLocation.source,
  ]);

  return (
    <main className="appShell">
      <section
        className={`mapCanvas ${mapProviderStatus === 'ready' ? 'hasProviderMap' : 'usesFallbackMap'} ${mapProviderStatus === 'loading' ? 'isMapLoading' : ''}`}
        aria-label="coupon map"
      >
        <div ref={mapContainerRef} className="providerMap" aria-hidden="true" />
        {mapProviderStatus !== 'ready' ? <MapStatusOverlay status={mapProviderStatus} /> : null}
        <div className="mapSoftLayer" />
        <MarkerLayer
          ref={markerLayerRef}
          map={mapRef.current}
          kakaoMaps={kakaoMapsRef.current}
          stores={displayView.stores}
          userCoords={userLocation.coords}
          mapProviderStatus={mapProviderStatus}
          showFallbackPins={showFallbackPins}
          activeStoreId={activeStoreId}
          onSelectStore={(storeId) => selectStore(storeId, 'map_marker')}
        />
        <div className="mapTopChrome">
          <strong className="mapBrand">
            <img className="mapBrandIcon" src="/icon.svg" alt="" aria-hidden="true" />
            <span>쿠폰맵</span>
          </strong>
          <div
            className={`mapActions ${isCouponPanelOpen ? 'isPanelOpen' : 'isPanelClosed'} ${isCouponSheetLowered ? 'isSheetLowered' : ''} ${isSheetDragging ? 'isSheetDragging' : ''}`}
            style={mobileMapActionsStyle}
          >
            <button
              type="button"
              className="mapFeedbackButton"
              onClick={(event) => {
                event.stopPropagation();
                openFeedback(
                  selectedStore && selectedCoupon ? 'coupon_incorrect' : 'feature_request'
                );
              }}
            >
              피드백 보내기
            </button>
            <button
              type="button"
              className="locateButton"
              aria-label={locateButtonLabel}
              disabled={userLocation.isLoading}
              onClick={(event) => {
                event.stopPropagation();
                returnToUserLocation();
              }}
            >
              <LocateIcon />
            </button>
          </div>
        </div>

        {displayView.stores.length === 0 ? (
          <div className="empty">
            <strong>표시할 쿠폰이 없습니다</strong>
            <span>{emptyDescription}</span>
            <button
              type="button"
              className="emptyFeedbackButton"
              onClick={() => openFeedback('store_location')}
            >
              누락된 매장 제보
            </button>
          </div>
        ) : null}
      </section>

      {loadMessage && displayView.stores.length > 0 ? (
        <p className={`notice ${loadStatus}`}>{loadMessage}</p>
      ) : null}

      <CouponPanel
        isCouponPanelOpen={isCouponPanelOpen}
        isCouponSheetLowered={isCouponSheetLowered}
        isSheetDragging={isSheetDragging}
        sheetDragY={sheetDragY}
        panelToggleLabel={panelToggleLabel}
        totals={displayView.totals}
        searchRadiusMeters={searchRadiusMeters}
        couponListItems={couponListItems}
        selectedStore={selectedStore}
        selectedCoupon={selectedCoupon}
        activeStoreId={activeStoreId}
        onToggle={handleToggleCouponPanel}
        onSheetPointerDown={startCouponSheetDrag}
        onSheetPointerMove={moveCouponSheetDrag}
        onSheetPointerEnd={finishCouponSheetDrag}
        onSelectCoupon={selectCoupon}
        onOpenFeedback={openFeedback}
      />

      {isFeedbackOpen ? (
        <FeedbackDialog
          type={feedbackType}
          message={feedbackMessage}
          contact={feedbackContact}
          status={feedbackSubmitStatus}
          error={feedbackError}
          onTypeChange={setFeedbackType}
          onMessageChange={setFeedbackMessage}
          onContactChange={setFeedbackContact}
          onSubmit={submitFeedback}
          onClose={closeFeedback}
        />
      ) : null}
    </main>
  );
}

function trackCouponSearchLoaded(
  source: CouponSearchSource,
  radiusMeters: number,
  response: CouponMapApiResponse
): void {
  trackAmplitudeEvent('coupon_search_loaded', {
    active_coupon_count: response.view.totals.activeCoupons,
    result_status: response.status,
    search_radius_meters: radiusMeters,
    source,
    store_count: response.view.totals.stores,
  });
}

function getUserLocationSearchSource(source: UserLocationSource): CouponSearchSource {
  if (source === 'geolocation') return 'user_location_geolocation';
  if (source === 'stored') return 'user_location_stored';
  return 'user_location_default';
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function getAutoFitMapLevel(level: number): number {
  return isMobileCouponSheet() ? level + MOBILE_MAP_LEVEL_OFFSET : level;
}

function getFocusedMapCenter(
  targetLatLng: KakaoLatLng,
  map: KakaoMap,
  kakaoMaps: KakaoMapsNamespace,
  mapContainer: HTMLElement | null,
  options: { isCouponPanelOpen: boolean }
): KakaoLatLng {
  if (isMobileCouponSheet()) {
    return targetLatLng;
  }

  return getDesktopFocusedMapCenter(
    targetLatLng,
    map,
    kakaoMaps,
    mapContainer,
    options.isCouponPanelOpen
  );
}

function getCurrentDesktopMapFocus(
  map: KakaoMap,
  kakaoMaps: KakaoMapsNamespace,
  mapContainer: HTMLElement | null,
  isCouponPanelOpen: boolean
): KakaoLatLng {
  const width = getMapContainerWidth(mapContainer);
  const height = getMapContainerHeight(mapContainer);

  return map.getProjection().coordsFromContainerPoint(
    new kakaoMaps.Point(getDesktopMapFocusX(width, isCouponPanelOpen), height / 2)
  );
}

function getDesktopFocusedMapCenter(
  targetLatLng: KakaoLatLng,
  map: KakaoMap,
  kakaoMaps: KakaoMapsNamespace,
  mapContainer: HTMLElement | null,
  isCouponPanelOpen: boolean
): KakaoLatLng {
  const projection = map.getProjection();
  const targetPoint = projection.containerPointFromCoords(targetLatLng);
  const width = getMapContainerWidth(mapContainer);
  const centerX = width / 2;
  const focusX = getDesktopMapFocusX(width, isCouponPanelOpen);

  return projection.coordsFromContainerPoint(
    new kakaoMaps.Point(targetPoint.x + centerX - focusX, targetPoint.y)
  );
}

function getDesktopMapFocusX(width: number, isCouponPanelOpen: boolean): number {
  const [, paddingRight, , paddingLeft] = getMapPadding(isCouponPanelOpen);
  const visibleWidth = Math.max(1, width - paddingLeft - paddingRight);

  return paddingLeft + visibleWidth / 2;
}

function getMapContainerWidth(mapContainer: HTMLElement | null): number {
  const rect = mapContainer?.getBoundingClientRect();

  return Math.round(rect?.width ?? 0) || DEFAULT_MAP_CONTAINER_WIDTH_PX;
}

function getMapContainerHeight(mapContainer: HTMLElement | null): number {
  const rect = mapContainer?.getBoundingClientRect();

  return Math.round(rect?.height ?? 0) || DEFAULT_MAP_CONTAINER_HEIGHT_PX;
}
