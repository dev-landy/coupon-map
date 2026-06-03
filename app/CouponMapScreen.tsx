'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { CouponMapCoupon, CouponMapStore, CouponMapView } from '../lib/frontendData';
import { openBrandApp } from '../lib/deeplink';

export type CouponMapLoadStatus = 'ready' | 'missing-env' | 'empty' | 'error';

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
    addListener(target: unknown, eventName: string, handler: () => void): unknown;
    removeListener(listener: unknown): void;
  };
  load(callback: () => void): void;
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

const KAKAO_MAP_APP_KEY = process.env.NEXT_PUBLIC_KAKAO_MAP_APP_KEY?.trim() ?? '';
const KAKAO_MAP_SCRIPT_ID = 'coupon-map-kakao-sdk';
const DEFAULT_CENTER = { lat: 37.5572, lng: 126.9254 };

export default function CouponMapScreen({ view, status, message }: CouponMapScreenProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<KakaoMap | null>(null);
  const kakaoMapsRef = useRef<KakaoMapsNamespace | null>(null);
  const markerFrameRef = useRef<number | null>(null);
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(
    view.stores[0]?.id ?? null
  );
  const [mapProviderStatus, setMapProviderStatus] = useState<MapProviderStatus>(
    KAKAO_MAP_APP_KEY ? 'loading' : 'missing-key'
  );
  const [markerPoints, setMarkerPoints] = useState<Record<string, MarkerScreenPoint>>({});
  const selectedStore = useMemo(
    () => view.stores.find((store) => store.id === selectedStoreId) ?? view.stores[0] ?? null,
    [selectedStoreId, view.stores]
  );
  const activeStoreId = selectedStore?.id ?? null;
  const markerDataKey = useMemo(
    () => view.stores.map((store) => `${store.id}:${store.lat},${store.lng}`).join('|'),
    [view.stores]
  );

  const scheduleMarkerProjection = useCallback(() => {
    if (markerFrameRef.current !== null) return;

    markerFrameRef.current = window.requestAnimationFrame(() => {
      markerFrameRef.current = null;

      const map = mapRef.current;
      const kakaoMaps = kakaoMapsRef.current;
      if (!map || !kakaoMaps) return;

      const projection = map.getProjection();
      const nextPoints: Record<string, MarkerScreenPoint> = {};

      for (const store of view.stores) {
        nextPoints[store.id] = projection.containerPointFromCoords(
          new kakaoMaps.LatLng(store.lat, store.lng)
        );
      }

      setMarkerPoints(nextPoints);
    });
  }, [view.stores]);

  const fitStoreBounds = useCallback(() => {
    const map = mapRef.current;
    const kakaoMaps = kakaoMapsRef.current;
    if (!map || !kakaoMaps) return;

    const centerStore = view.stores[0];
    if (view.stores.length === 0 || !centerStore) {
      map.setCenter(new kakaoMaps.LatLng(DEFAULT_CENTER.lat, DEFAULT_CENTER.lng));
      map.setLevel(4);
      scheduleMarkerProjection();
      return;
    }

    if (view.stores.length === 1) {
      map.setCenter(new kakaoMaps.LatLng(centerStore.lat, centerStore.lng));
      map.setLevel(3);
      scheduleMarkerProjection();
      return;
    }

    const bounds = new kakaoMaps.LatLngBounds();
    for (const store of view.stores) {
      bounds.extend(new kakaoMaps.LatLng(store.lat, store.lng));
    }

    map.setBounds(bounds, ...getMapPadding());
    scheduleMarkerProjection();
  }, [scheduleMarkerProjection, view.stores]);

  useEffect(() => {
    if (!KAKAO_MAP_APP_KEY) {
      setMapProviderStatus('missing-key');
      return;
    }

    let isActive = true;
    let listeners: unknown[] = [];
    let createdMap: KakaoMap | null = null;

    loadKakaoMaps(KAKAO_MAP_APP_KEY)
      .then((kakaoMaps) => {
        if (!isActive || !mapContainerRef.current) return;

        kakaoMapsRef.current = kakaoMaps;

        const centerStore = view.stores[0];
        const center = new kakaoMaps.LatLng(
          centerStore?.lat ?? DEFAULT_CENTER.lat,
          centerStore?.lng ?? DEFAULT_CENTER.lng
        );
        const map = new kakaoMaps.Map(mapContainerRef.current, {
          center,
          level: view.stores.length > 1 ? 5 : 3,
          scrollwheel: true,
          tileAnimation: true,
        });

        createdMap = map;
        mapRef.current = map;
        setMapProviderStatus('ready');
        listeners = [
          kakaoMaps.event.addListener(map, 'bounds_changed', scheduleMarkerProjection),
          kakaoMaps.event.addListener(map, 'zoom_changed', scheduleMarkerProjection),
          kakaoMaps.event.addListener(map, 'idle', scheduleMarkerProjection),
        ];

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
          kakaoMaps.event.removeListener(listener);
        }
      }

      if (createdMap && mapRef.current === createdMap) {
        mapRef.current = null;
        if (mapContainerRef.current) mapContainerRef.current.innerHTML = '';
      }
    };
  }, [fitStoreBounds, markerDataKey, scheduleMarkerProjection, view.stores]);

  useEffect(() => {
    if (mapProviderStatus !== 'ready') return;
    fitStoreBounds();
  }, [fitStoreBounds, mapProviderStatus, markerDataKey]);

  useEffect(() => {
    if (mapProviderStatus !== 'ready') return;

    const handleResize = () => {
      mapRef.current?.relayout();
      fitStoreBounds();
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [fitStoreBounds, mapProviderStatus]);

  const selectStore = useCallback(
    (storeId: string) => {
      setSelectedStoreId(storeId);

      const store = view.stores.find((candidate) => candidate.id === storeId);
      const map = mapRef.current;
      const kakaoMaps = kakaoMapsRef.current;
      if (!store || !map || !kakaoMaps) return;

      map.panTo(new kakaoMaps.LatLng(store.lat, store.lng));
      scheduleMarkerProjection();
    },
    [scheduleMarkerProjection, view.stores]
  );

  return (
    <main className="appShell">
      <section
        className={`mapCanvas ${mapProviderStatus === 'ready' ? 'hasProviderMap' : 'usesFallbackMap'}`}
        aria-label="coupon map"
      >
        <div ref={mapContainerRef} className="providerMap" aria-hidden="true" />
        <MapBackdrop />
        <div className="mapSoftLayer" />
        <div className="myLocation" aria-hidden="true">
          <span />
        </div>

        {view.stores.length === 0 ? (
          <div className="empty">
            <strong>표시할 쿠폰이 없습니다</strong>
            <span>Supabase에 활성 쿠폰과 매장 좌표가 들어오면 여기에 표시됩니다.</span>
          </div>
        ) : (
          view.stores.map((store) => (
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
                <span className="pinLogo">{store.brandInitial}</span>
                <span className="pinDeal">
                  <small>최대</small>
                  <b>{store.bestCoupon.headline}</b>
                </span>
              </span>
              <span className="pinTail" />
            </button>
          ))
        )}
      </section>

      <section className="topControls" aria-label="map controls">
        <div className="locationBar">
          <LocationIcon />
          <div>
            <p>홍대입구</p>
            <span>근처 쿠폰 지도</span>
          </div>
        </div>
        <button
          type="button"
          className="iconButton"
          aria-label="쿠폰 위치 다시 보기"
          onClick={fitStoreBounds}
        >
          <LocateIcon />
        </button>
      </section>

      {message ? <p className={`notice ${status}`}>{message}</p> : null}

      <aside className="couponPanel" aria-label="nearby coupons">
        <div className="sheetHandle" aria-hidden="true" />
        <div className="panelHeader">
          <div>
            <p className="eyebrow">CouponMap</p>
            <h1>근처 쿠폰 매장</h1>
          </div>
          <div className="stats" aria-label="coupon summary">
            <span>{view.totals.brands} brands</span>
            <span>{view.totals.stores} stores</span>
            <span>{view.totals.activeCoupons} coupons</span>
          </div>
        </div>

        {selectedStore ? (
          <section
            className="selectedDetail"
            aria-live="polite"
            data-testid="selected-store-detail"
            data-selected-store-id={selectedStore.id}
          >
            <div className="selectedHead">
              <span className="brandLogo" style={{ background: selectedStore.brandColor }}>
                {selectedStore.brandInitial}
              </span>
              <div>
                <p>{selectedStore.brandName}</p>
                <h2>{selectedStore.bestCoupon.title}</h2>
                <span>{selectedStore.name}</span>
              </div>
              <strong>{selectedStore.bestCoupon.headline}</strong>
            </div>

            {selectedStore.bestCoupon.facts.length > 0 ? (
              <dl className="couponFacts" aria-label="coupon details">
                {selectedStore.bestCoupon.facts.map((fact) => (
                  <div key={`${fact.label}-${fact.value}`}>
                    <dt>{fact.label}</dt>
                    <dd>{fact.value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}

            <div className="couponCards" aria-label={`${selectedStore.brandName} coupons`}>
              {selectedStore.coupons.slice(0, 3).map((coupon) => (
                <CouponCard coupon={coupon} key={coupon.id} />
              ))}
            </div>

            <button
              type="button"
              className="openAppButton"
              onClick={() =>
                openBrandApp(selectedStore.brand, undefined, selectedStore.bestCoupon.appLink)
              }
            >
              앱에서 열기
              <ArrowIcon />
            </button>
          </section>
        ) : null}

        <div className="sectionHeader">
          <h2>전체 매장</h2>
          <span>{view.stores.length}</span>
        </div>

        <div className="storeList">
          {view.stores.map((store) => (
            <StoreCard
              key={store.id}
              store={store}
              isSelected={store.id === activeStoreId}
              onSelect={() => selectStore(store.id)}
            />
          ))}
        </div>
      </aside>

      <style dangerouslySetInnerHTML={{ __html: styles }} />
    </main>
  );
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

function getMapPadding(): [number, number, number, number] {
  if (typeof window === 'undefined') return [92, 460, 40, 32];

  if (window.matchMedia('(max-width: 760px)').matches) {
    const bottomPanelPadding = Math.min(Math.round(window.innerHeight * 0.58) + 28, 500);
    return [96, 24, bottomPanelPadding, 24];
  }

  return [92, 460, 40, 32];
}

function StoreCard({
  store,
  isSelected,
  onSelect,
}: {
  store: CouponMapStore;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <article
      className={`storeCard ${isSelected ? 'selected' : ''}`}
      id={`store-${store.id}`}
      role="button"
      tabIndex={0}
      aria-pressed={isSelected}
      aria-current={isSelected ? 'true' : undefined}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect();
        }
      }}
    >
      <div className="storeLogo" style={{ background: store.brandColor }}>
        {store.brandInitial}
      </div>
      <div className="storeCopy">
        <div className="storeTitle">
          <h3>{store.brandName}</h3>
          <span>{store.name}</span>
        </div>
        <p>{store.bestCoupon.detail}</p>
        <address>{store.address}</address>
      </div>
      <div className="storeDeal">
        <small>최대</small>
        <strong>{store.bestCoupon.headline}</strong>
        <span>{store.coupons.length}개</span>
      </div>
    </article>
  );
}

function CouponCard({ coupon }: { coupon: CouponMapCoupon }) {
  return (
    <article className="couponCard">
      <div className="discountBlock">
        <span>{coupon.discountType}</span>
        <strong>{coupon.headline}</strong>
      </div>
      <div className="couponCopy">
        <h3>{coupon.title}</h3>
        <p>{coupon.detail}</p>
        <div>
          <span>{coupon.validLabel}</span>
        </div>
      </div>
    </article>
  );
}

function MapBackdrop() {
  return (
    <svg
      className="mapBackdrop"
      viewBox="0 0 1200 800"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <rect width="1200" height="800" fill="#f0eee8" />
      <g fill="#e5e1d5" stroke="#d9d4c5" strokeWidth="1.5">
        <rect x="16" y="36" width="150" height="84" rx="8" />
        <rect x="190" y="28" width="132" height="92" rx="8" />
        <rect x="356" y="42" width="152" height="78" rx="8" />
        <rect x="812" y="34" width="150" height="84" rx="8" />
        <rect x="986" y="42" width="172" height="92" rx="8" />
        <rect x="38" y="198" width="132" height="96" rx="8" />
        <rect x="218" y="212" width="152" height="88" rx="8" />
        <rect x="442" y="196" width="132" height="88" rx="8" />
        <rect x="732" y="196" width="158" height="96" rx="8" />
        <rect x="944" y="210" width="150" height="90" rx="8" />
        <rect x="16" y="392" width="154" height="96" rx="8" />
        <rect x="232" y="404" width="132" height="88" rx="8" />
        <rect x="434" y="390" width="154" height="96" rx="8" />
        <rect x="748" y="392" width="146" height="96" rx="8" />
        <rect x="980" y="404" width="160" height="88" rx="8" />
        <rect x="58" y="612" width="148" height="94" rx="8" />
        <rect x="292" y="620" width="138" height="84" rx="8" />
        <rect x="520" y="608" width="150" height="94" rx="8" />
        <rect x="790" y="620" width="154" height="84" rx="8" />
        <rect x="996" y="610" width="152" height="92" rx="8" />
      </g>
      <path
        d="M180 0 C260 150 330 220 430 320 C560 448 650 570 710 800"
        fill="none"
        stroke="#cfe3b6"
        strokeWidth="54"
        strokeLinecap="round"
      />
      <path
        d="M180 0 C260 150 330 220 430 320 C560 448 650 570 710 800"
        fill="none"
        stroke="#bcd59d"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <g fill="none">
        <path d="M-40 166 L1240 166" stroke="#d8d2c0" strokeWidth="44" />
        <path d="M-40 166 L1240 166" stroke="#ffffff" strokeWidth="34" />
        <path d="M-40 520 L1240 520" stroke="#d8d2c0" strokeWidth="38" />
        <path d="M-40 520 L1240 520" stroke="#ffffff" strokeWidth="30" />
        <path d="M620 -40 L620 840" stroke="#d8d2c0" strokeWidth="42" />
        <path d="M620 -40 L620 840" stroke="#ffffff" strokeWidth="32" />
        <path d="M-40 760 C230 620 400 470 544 318 C720 132 920 60 1240 42" stroke="#d8d2c0" strokeWidth="34" />
        <path d="M-40 760 C230 620 400 470 544 318 C720 132 920 60 1240 42" stroke="#ffffff" strokeWidth="26" />
      </g>
      <g stroke="#ffffff" strokeWidth="12">
        <line x1="0" y1="316" x2="1200" y2="316" />
        <line x1="0" y1="664" x2="1200" y2="664" />
        <line x1="112" y1="0" x2="112" y2="800" />
        <line x1="330" y1="0" x2="330" y2="800" />
        <line x1="878" y1="0" x2="878" y2="800" />
        <line x1="1092" y1="0" x2="1092" y2="800" />
      </g>
      <path
        d="M-30 70 C140 80 250 130 376 222 C510 320 672 374 890 420 C990 442 1088 480 1230 540"
        fill="none"
        stroke="#00a84d"
        strokeWidth="8"
        strokeLinecap="round"
      />
      <g fill="#ffffff" stroke="#00a84d" strokeWidth="6">
        <circle cx="370" cy="218" r="15" />
        <circle cx="790" cy="398" r="15" />
      </g>
      <g fontFamily="Pretendard, system-ui, sans-serif" fontWeight="700" fill="#847a62">
        <text x="180" y="110" fontSize="24">신촌동</text>
        <text x="720" y="116" fontSize="24">연남동</text>
        <text x="386" y="210" fontSize="24" fill="#1b7a3f">홍대입구역</text>
        <text x="812" y="388" fontSize="24" fill="#1b7a3f">합정역</text>
        <text x="174" y="646" fontSize="22" fill="#6fa856">경의선숲길</text>
        <text x="894" y="634" fontSize="24">서교동</text>
      </g>
    </svg>
  );
}

function LocationIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        d="M9 1.6c-3 0-5.4 2.3-5.4 5.3 0 4.1 5.4 9.1 5.4 9.1s5.4-5 5.4-9.1c0-3-2.4-5.3-5.4-5.3z"
        fill="currentColor"
      />
      <circle cx="9" cy="6.8" r="2" fill="#fff" />
    </svg>
  );
}

function LocateIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="4.1" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="10" cy="10" r="1.4" fill="currentColor" />
      <path
        d="M10 1.7v3M10 15.3v3M1.7 10h3M15.3 10h3"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
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
    background: #f0eee8;
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

  .mapBackdrop {
    position: absolute;
    z-index: 0;
    inset: 0;
    display: block;
    width: 100%;
    height: 100%;
    pointer-events: none;
    transition: opacity .2s ease;
  }

  .hasProviderMap .mapBackdrop {
    opacity: 0;
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

  .topControls {
    position: fixed;
    z-index: 40;
    top: 18px;
    left: 18px;
    display: flex;
    gap: 8px;
    width: min(420px, calc(100vw - 36px));
  }

  .locationBar,
  .iconButton {
    border: 1px solid rgba(21,21,26,.06);
    background: rgba(255,255,255,.96);
    box-shadow: 0 10px 28px rgba(20,20,30,.12);
  }

  .locationBar {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
    height: 48px;
    flex: 1;
    border-radius: 8px;
    padding: 0 14px;
    color: #f5402c;
  }

  .locationBar div {
    min-width: 0;
  }

  .locationBar p {
    color: #15151a;
    font-size: 15px;
    font-weight: 800;
    letter-spacing: 0;
  }

  .locationBar span {
    display: block;
    overflow: hidden;
    color: #777780;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .iconButton {
    display: grid;
    place-items: center;
    width: 48px;
    height: 48px;
    flex: 0 0 auto;
    border-radius: 8px;
    color: #15151a;
    cursor: pointer;
  }

  .notice {
    position: fixed;
    z-index: 50;
    top: 74px;
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
    left: 50%;
    top: 50%;
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
  .storeDeal small {
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
  .storeCard:focus-visible,
  .iconButton:focus-visible,
  .openAppButton:focus-visible {
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

  .couponPanel {
    position: fixed;
    z-index: 35;
    top: 22px;
    right: 22px;
    bottom: 22px;
    display: flex;
    width: min(420px, calc(100vw - 44px));
    flex-direction: column;
    overflow: hidden;
    border: 1px solid rgba(21,21,26,.08);
    border-radius: 8px;
    background: rgba(255,255,255,.97);
    box-shadow: 0 24px 60px rgba(20,20,30,.22);
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

  .selectedHead span {
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

  .couponCards {
    display: grid;
    gap: 8px;
  }

  .couponCard {
    display: grid;
    grid-template-columns: 78px minmax(0, 1fr);
    gap: 10px;
    min-height: 84px;
    border: 1px solid #ececef;
    border-radius: 8px;
    padding: 10px;
    background: #fff;
  }

  .discountBlock {
    display: grid;
    place-items: center;
    align-content: center;
    gap: 3px;
    border-radius: 8px;
    background: #fff1ee;
    color: #f5402c;
    text-align: center;
  }

  .discountBlock span {
    font-size: 10px;
    font-weight: 800;
  }

  .discountBlock strong {
    font-size: 18px;
    font-weight: 900;
    font-variant-numeric: tabular-nums;
  }

  .couponCopy {
    display: grid;
    align-content: center;
    gap: 5px;
    min-width: 0;
  }

  .couponCopy h3 {
    overflow: hidden;
    color: #15151a;
    font-size: 14px;
    line-height: 1.25;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .couponCopy p {
    overflow: hidden;
    color: #5b5b63;
    font-size: 13px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .couponCopy div {
    display: flex;
    gap: 6px;
    align-items: center;
  }

  .couponCopy span {
    border-radius: 6px;
    padding: 2px 7px;
    background: #fff1ee;
    color: #f5402c;
    font-size: 12px;
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

  .storeList {
    display: grid;
    flex: 1;
    align-content: start;
    overflow: auto;
    border-top: 1px solid #ececef;
  }

  .storeList::-webkit-scrollbar {
    width: 0;
    height: 0;
  }

  .storeCard {
    display: grid;
    grid-template-columns: 42px minmax(0, 1fr) auto;
    gap: 12px;
    align-items: center;
    border: 0;
    border-bottom: 1px solid #ececef;
    padding: 14px 18px;
    background: #fff;
    cursor: pointer;
    transition: background .16s ease, box-shadow .16s ease;
  }

  .storeCard.selected {
    background: #f7f7f5;
    box-shadow: inset 3px 0 0 #f5402c;
  }

  .storeLogo {
    width: 42px;
    height: 42px;
    border-radius: 8px;
    font-size: 13px;
  }

  .storeCopy {
    min-width: 0;
  }

  .storeTitle {
    display: flex;
    min-width: 0;
    align-items: baseline;
    gap: 6px;
  }

  .storeTitle h3 {
    overflow: hidden;
    color: #15151a;
    font-size: 15px;
    font-weight: 900;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .storeTitle span {
    overflow: hidden;
    color: #9a9aa2;
    font-size: 12px;
    font-weight: 700;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .storeCopy p,
  .storeCopy address {
    overflow: hidden;
    color: #5b5b63;
    font-size: 12px;
    font-style: normal;
    line-height: 1.35;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .storeCopy p {
    margin-top: 3px;
  }

  .storeDeal {
    display: grid;
    justify-items: end;
    gap: 2px;
    min-width: 72px;
  }

  .storeDeal strong {
    color: #f5402c;
    font-size: 18px;
    font-weight: 900;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .storeDeal span {
    color: #5b5b63;
    font-size: 12px;
    font-weight: 800;
  }

  @media (max-width: 760px) {
    .topControls {
      top: max(14px, env(safe-area-inset-top));
      left: 14px;
      width: calc(100vw - 28px);
    }

    .notice {
      top: calc(max(14px, env(safe-area-inset-top)) + 58px);
      left: 14px;
      width: calc(100vw - 28px);
    }

    .couponPanel {
      top: auto;
      right: 0;
      bottom: 0;
      left: 0;
      width: 100%;
      height: min(58dvh, 470px);
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

    .selectedHead p {
      font-size: 15px;
    }

    .selectedHead h2 {
      font-size: 14px;
    }

    .selectedHead strong {
      font-size: 18px;
    }

    .couponFacts,
    .couponCards {
      display: none;
    }

    .openAppButton {
      min-height: 46px;
      font-size: 15px;
    }

    .sectionHeader {
      padding: 12px 18px 8px;
    }

    .storeCard {
      grid-template-columns: 40px minmax(0, 1fr) auto;
      padding: 13px 18px;
    }

    .storeLogo {
      width: 40px;
      height: 40px;
    }

    .storeDeal {
      min-width: 64px;
    }

    .storeDeal strong {
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
