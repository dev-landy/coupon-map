/** Kakao Maps SDK types, lazy loader, and viewport padding helpers. */

export type MapProviderStatus = 'loading' | 'ready' | 'missing-key' | 'error';

export interface MarkerScreenPoint {
  x: number;
  y: number;
}

export interface KakaoLatLng {
  getLat(): number;
  getLng(): number;
}

export interface KakaoLatLngBounds {
  extend(latlng: KakaoLatLng): void;
}

export interface KakaoMapProjection {
  containerPointFromCoords(latlng: KakaoLatLng): MarkerScreenPoint;
}

export interface KakaoMap {
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

export interface KakaoMapsNamespace {
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

export interface KakaoMapListener {
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

const KAKAO_MAP_SCRIPT_ID = 'coupon-map-kakao-sdk';
export const DEFAULT_CENTER = { lat: 37.5572, lng: 126.9254 };

export function readKakaoMapAppKey(): string {
  return process.env.NEXT_PUBLIC_KAKAO_MAP_APP_KEY?.trim() ?? '';
}

export function loadKakaoMaps(appKey: string): Promise<KakaoMapsNamespace> {
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

export function getMapPadding(isCouponPanelOpen: boolean): [number, number, number, number] {
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

export function isMobileCouponSheet(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(max-width: 760px)').matches
  );
}
