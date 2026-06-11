import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import CouponMapScreen from '../app/CouponMapScreen';
import type { CouponMapView } from '../lib/frontendData';
import { USER_LOCATION_STORAGE_KEY } from '../lib/geo';

vi.mock('../lib/deeplink', () => ({
  openBrandApp: vi.fn(),
}));

vi.mock('../lib/amplitude', () => ({
  trackAmplitudeEvent: vi.fn(),
}));

const { openBrandApp } = await import('../lib/deeplink');
const { trackAmplitudeEvent } = await import('../lib/amplitude');
const originalGeolocation = navigator.geolocation;
const originalMatchMedia = window.matchMedia;
const originalLocalStorage = window.localStorage;

afterEach(() => {
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: originalGeolocation,
  });
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: originalMatchMedia,
  });
  try {
    window.localStorage.removeItem?.('coupon-map-feedback-last-submitted-at');
    window.localStorage.removeItem?.(USER_LOCATION_STORAGE_KEY);
  } catch {
    // Some jsdom launch modes provide a partial localStorage shim.
  }
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: originalLocalStorage,
  });
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  window.__couponMapKakaoLoader = undefined;
  vi.clearAllMocks();
});

const VIEW: CouponMapView = {
  stores: [
    {
      id: 'hongdae',
      name: '홍대점',
      address: '서울 마포구',
      brand: {
        id: 'brand-mcdonalds',
        name: '맥도날드',
        app_scheme: 'https://links.mcdonaldsapps.com/',
        store_url: 'https://www.mcdonalds.co.kr',
        app_store_url: null,
      },
      brandName: '맥도날드',
      brandInitial: '맥도',
      brandColor: '#d92d20',
      lat: 37.5563,
      lng: 126.9236,
      markerX: 35,
      markerY: 45,
      bestCoupon: {
        id: 'bigmac',
        title: '빅맥 20%',
        headline: '20%',
        detail: '할인',
        validLabel: 'D-7',
        discountType: '정률',
        appLink: 'mcdonaldskr://coupon/bigmac',
        facts: [
          { label: '결제금액', value: '5,900원' },
          { label: '주문', value: '매장 방문' },
          { label: '유효기간', value: '2026년 06월 30일까지' },
        ],
        rankScore: 3_000_020,
      },
      coupons: [
        {
          id: 'bigmac',
          title: '빅맥 20%',
          headline: '20%',
          detail: '할인',
          validLabel: 'D-7',
          discountType: '정률',
          appLink: 'mcdonaldskr://coupon/bigmac',
          facts: [],
          rankScore: 3_000_020,
        },
        {
          id: 'fries',
          title: '감자튀김 1,000원 할인',
          headline: '1,000원',
          detail: '사이드 할인',
          validLabel: 'D-3',
          discountType: '정액',
          appLink: 'mcdonaldskr://coupon/fries',
          facts: [{ label: '주문', value: '앱 주문' }],
          rankScore: 2_001_000,
        },
      ],
    },
    {
      id: 'gangnam',
      name: '강남점',
      address: '서울 강남구',
      brand: {
        id: 'brand-burgerking',
        name: '버거킹',
        app_scheme: 'burgerking://main',
        store_url: 'https://www.burgerking.co.kr',
        app_store_url: 'https://play.google.com/store/apps/details?id=kr.co.burgerkinghybrid',
      },
      brandName: '버거킹',
      brandInitial: '버거',
      brandColor: '#067647',
      lat: 37.4979,
      lng: 127.0276,
      markerX: 65,
      markerY: 35,
      bestCoupon: {
        id: 'whopper',
        title: '와퍼 3,000원 할인',
        headline: '3,000원',
        detail: '즉시 할인',
        validLabel: '오늘까지',
        discountType: '정액',
        appLink: null,
        facts: [],
        rankScore: 2_003_000,
      },
      coupons: [
        {
          id: 'whopper',
          title: '와퍼 3,000원 할인',
          headline: '3,000원',
          detail: '즉시 할인',
          validLabel: '오늘까지',
          discountType: '정액',
          appLink: null,
          facts: [],
          rankScore: 2_003_000,
        },
      ],
    },
  ],
  totals: {
    brands: 2,
    stores: 2,
    activeCoupons: 3,
  },
};

const KFC_VIEW: CouponMapView = {
  stores: [
    {
      ...VIEW.stores[0],
      id: 'kfc-hongdae',
      brand: {
        id: 'brand-kfc',
        source: 'kfc-kr-adb',
        external_id: 'kfc',
        name: 'KFC',
        app_scheme: 'kfcremaster://main',
        store_url: 'https://www.kfckorea.com',
        app_store_url: 'https://play.google.com/store/apps/details?id=kfc_ko.kore.kg.kfc_korea',
      },
      brandName: 'KFC',
      brandInitial: 'KF',
      brandColor: '#175cd3',
    },
  ],
  totals: {
    brands: 1,
    stores: 1,
    activeCoupons: 2,
  },
};

function firePointer(
  target: HTMLElement,
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  pageY: number
) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    button: { value: 0 },
    clientY: { value: pageY },
    pageY: { value: pageY },
    pointerId: { value: 1 },
    pointerType: { value: 'touch' },
  });
  fireEvent(target, event);
}

function mockMobileViewport() {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn((query: string) => ({
      matches: query === '(max-width: 760px)',
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

class MockKakaoLatLng {
  constructor(
    private readonly lat: number,
    private readonly lng: number
  ) {}

  getLat(): number {
    return this.lat;
  }

  getLng(): number {
    return this.lng;
  }
}

class MockKakaoLatLngBounds {
  readonly points: MockKakaoLatLng[] = [];

  extend(latlng: MockKakaoLatLng): void {
    this.points.push(latlng);
  }
}

class MockKakaoPoint {
  constructor(
    readonly x: number,
    readonly y: number
  ) {}
}

class MockKakaoMap {
  private center: MockKakaoLatLng;
  private level: number;
  private readonly listeners = new Map<string, Set<() => void>>();

  constructor(
    _container: HTMLElement,
    options: {
      center: MockKakaoLatLng;
      level: number;
    }
  ) {
    this.center = options.center;
    this.level = options.level;
    latestKakaoMap = this;
  }

  getCenter(): MockKakaoLatLng {
    return this.center;
  }

  getLevel(): number {
    return this.level;
  }

  getProjection(): {
    containerPointFromCoords(latlng: MockKakaoLatLng): { x: number; y: number };
    coordsFromContainerPoint(point: MockKakaoPoint): MockKakaoLatLng;
  } {
    return {
      containerPointFromCoords: (latlng) => ({
        x: Math.round(400 + (latlng.getLng() - this.center.getLng()) * 100_000),
        y: Math.round(300 - (latlng.getLat() - this.center.getLat()) * 100_000),
      }),
      coordsFromContainerPoint: (point) =>
        new MockKakaoLatLng(
          this.center.getLat() + (300 - point.y) / 100_000,
          this.center.getLng() + (point.x - 400) / 100_000
        ),
    };
  }

  panTo(latlng: MockKakaoLatLng): void {
    this.center = latlng;
    this.emit('center_changed');
    this.emit('bounds_changed');
    this.emit('idle');
  }

  relayout(): void {}

  setBounds(
    bounds: MockKakaoLatLngBounds,
    _paddingTop = 0,
    paddingRight = 0,
    _paddingBottom = 0,
    paddingLeft = 0
  ): void {
    if (bounds.points.length > 0) {
      const latSum = bounds.points.reduce((sum, point) => sum + point.getLat(), 0);
      const lngSum = bounds.points.reduce((sum, point) => sum + point.getLng(), 0);
      this.center = new MockKakaoLatLng(
        latSum / bounds.points.length,
        lngSum / bounds.points.length + (paddingRight - paddingLeft) / 200_000
      );
    }
    this.emit('bounds_changed');
    this.emit('idle');
  }

  setCenter(latlng: MockKakaoLatLng): void {
    this.center = latlng;
    this.emit('center_changed');
    this.emit('bounds_changed');
  }

  setLevel(level: number): void {
    this.level = level;
    this.emit('zoom_changed');
    this.emit('bounds_changed');
  }

  moveCameraTo(lat: number, lng: number): void {
    this.center = new MockKakaoLatLng(lat, lng);
    this.emit('center_changed');
  }

  addListener(eventName: string, handler: () => void): void {
    const handlers = this.listeners.get(eventName) ?? new Set();
    handlers.add(handler);
    this.listeners.set(eventName, handlers);
  }

  removeListener(eventName: string, handler: () => void): void {
    this.listeners.get(eventName)?.delete(handler);
  }

  private emit(eventName: string): void {
    for (const handler of this.listeners.get(eventName) ?? []) {
      handler();
    }
  }
}

let latestKakaoMap: MockKakaoMap | null = null;

function mockAnimationFrame() {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    window.setTimeout(() => callback(window.performance.now()), 0)
  );
  vi.stubGlobal('cancelAnimationFrame', (id: number) => window.clearTimeout(id));
}

function mockKakaoMaps() {
  latestKakaoMap = null;
  vi.stubGlobal('kakao', {
    maps: {
      LatLng: MockKakaoLatLng,
      LatLngBounds: MockKakaoLatLngBounds,
      Point: MockKakaoPoint,
      Map: MockKakaoMap,
      event: {
        addListener(target: MockKakaoMap, eventName: string, handler: () => void) {
          target.addListener(eventName, handler);
        },
        removeListener(target: MockKakaoMap, eventName: string, handler: () => void) {
          target.removeListener(eventName, handler);
        },
      },
      load(callback: () => void) {
        callback();
      },
    },
  });
}

function mockLocalStorage() {
  const values = new Map<string, string>();

  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => {
        values.set(key, value);
      }),
      removeItem: vi.fn((key: string) => {
        values.delete(key);
      }),
    },
  });
}

describe('CouponMapScreen', () => {
  it('shows rich coupon details and opens the selected coupon app link', () => {
    render(<CouponMapScreen view={VIEW} status="ready" message={null} />);

    expect(screen.getByText('결제금액')).toBeTruthy();
    expect(screen.getByText('5,900원')).toBeTruthy();
    expect(screen.getByText('매장 방문')).toBeTruthy();
    expect(screen.getByText('2026년 06월 30일까지')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '앱에서 열기' }));

    expect(openBrandApp).toHaveBeenCalledWith(
      VIEW.stores[0].brand,
      undefined,
      'mcdonaldskr://coupon/bigmac'
    );
  });

  it('lists nearby coupons and opens the selected coupon row app link', () => {
    render(<CouponMapScreen view={VIEW} status="ready" message={null} />);

    expect(screen.getByText('1km 내 쿠폰')).toBeTruthy();

    fireEvent.click(
      screen.getByRole('button', {
        name: '맥도날드 홍대점 감자튀김 1,000원 할인 1,000원',
      })
    );

    const detail = screen.getByTestId('selected-store-detail');
    expect(detail.getAttribute('data-selected-store-id')).toBe('hongdae');
    expect(detail.getAttribute('data-selected-coupon-id')).toBe('fries');
    expect(detail.querySelector('h2')?.textContent).toBe('감자튀김 1,000원 할인');

    expect(openBrandApp).toHaveBeenCalledTimes(1);
    expect(openBrandApp).toHaveBeenCalledWith(
      VIEW.stores[0].brand,
      undefined,
      'mcdonaldskr://coupon/fries'
    );
    expect(trackAmplitudeEvent).toHaveBeenCalledWith(
      'coupon_selected',
      expect.objectContaining({
        brand_id: 'brand-mcdonalds',
        coupon_id: 'fries',
        source: 'coupon_list',
        store_id: 'hongdae',
      })
    );
    expect(trackAmplitudeEvent).toHaveBeenCalledWith(
      'coupon_app_opened',
      expect.objectContaining({
        brand_id: 'brand-mcdonalds',
        coupon_id: 'fries',
        source: 'coupon_list',
        store_id: 'hongdae',
      })
    );
  });

  it('tracks the coupon map view event for retention analysis', () => {
    render(<CouponMapScreen view={VIEW} status="ready" message={null} />);

    expect(trackAmplitudeEvent).toHaveBeenCalledWith('coupon_map_viewed', {
      active_coupon_count: 3,
      initial_status: 'ready',
      search_radius_meters: 1000,
      store_count: 2,
    });
  });

  it('uses the same KFC brand badge in the selected detail and coupon list', () => {
    const { container } = render(<CouponMapScreen view={KFC_VIEW} status="ready" message={null} />);

    const selectedLogo = container.querySelector('.selectedHead .brandLogo');
    const listLogo = container.querySelector('.couponListRow .storeLogo');

    expect(selectedLogo?.textContent).toBe('KFC');
    expect(listLogo?.textContent).toBe('KFC');
    expect(selectedLogo?.getAttribute('data-brand-logo')).toBe('kfc');
    expect(listLogo?.getAttribute('data-brand-logo')).toBe('kfc');
  });

  it('renders Korean brand full names inside brand badges', () => {
    const { container } = render(<CouponMapScreen view={VIEW} status="ready" message={null} />);

    const selectedLogo = container.querySelector('.selectedHead .brandLogo');
    const markerLogos = Array.from(container.querySelectorAll('.marker .pinLogo'));

    expect(selectedLogo?.textContent).toBe('맥도날드');
    expect(selectedLogo?.getAttribute('data-brand-logo')).toBe('mcdonalds');
    expect(markerLogos.map((logo) => logo.textContent)).toEqual(
      expect.arrayContaining(['맥도날드', '버거킹'])
    );

    fireEvent.click(screen.getByRole('button', { name: '버거킹 강남점 3,000원' }));

    const burgerKingSelectedLogo = container.querySelector('.selectedHead .brandLogo');

    expect(burgerKingSelectedLogo?.textContent).toBe('버거킹');
    expect(burgerKingSelectedLogo?.getAttribute('data-brand-logo')).toBe('burgerking');
  });

  it('updates the selected store from marker and list interactions', () => {
    const { container } = render(<CouponMapScreen view={VIEW} status="ready" message={null} />);

    const hongdaeMarker = screen.getByRole('button', { name: '맥도날드 홍대점 20%' });
    const gangnamMarker = screen.getByRole('button', { name: '버거킹 강남점 3,000원' });
    const hongdaeCard = container.querySelector('#store-hongdae');
    const gangnamCard = container.querySelector('#store-gangnam');
    const detail = screen.getByTestId('selected-store-detail');

    expect(hongdaeMarker.getAttribute('aria-pressed')).toBe('true');
    expect(detail.getAttribute('data-selected-store-id')).toBe('hongdae');

    fireEvent.click(gangnamMarker);

    expect(gangnamMarker.getAttribute('aria-pressed')).toBe('true');
    expect(gangnamCard?.className).toContain('selected');
    expect(detail.getAttribute('data-selected-store-id')).toBe('gangnam');
    expect(detail.querySelector('h2')?.textContent).toBe('와퍼 3,000원 할인');

    fireEvent.click(hongdaeCard as Element);

    expect(hongdaeMarker.getAttribute('aria-pressed')).toBe('true');
    expect(detail.getAttribute('data-selected-store-id')).toBe('hongdae');
  });

  it('collapses and reopens the coupon panel', () => {
    render(<CouponMapScreen view={VIEW} status="ready" message={null} />);

    fireEvent.click(screen.getByRole('button', { name: '쿠폰 패널 닫기' }));

    const openPanelButton = screen.getByRole('button', { name: '쿠폰 패널 열기' });
    expect(openPanelButton.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByTestId('selected-store-detail')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '버거킹 강남점 3,000원' }));

    const closePanelButton = screen.getByRole('button', { name: '쿠폰 패널 닫기' });
    expect(closePanelButton.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByTestId('selected-store-detail').getAttribute('data-selected-store-id')).toBe(
      'gangnam'
    );
  });

  it('lowers and restores the mobile coupon sheet from the drag handle', () => {
    mockMobileViewport();

    const { container } = render(<CouponMapScreen view={VIEW} status="ready" message={null} />);
    const sheetDragArea = container.querySelector('.sheetDragArea') as HTMLElement;
    const panelDock = container.querySelector('.panelDock') as HTMLElement;

    firePointer(sheetDragArea, 'pointerdown', 120);
    firePointer(sheetDragArea, 'pointermove', 240);

    expect(panelDock.style.getPropertyValue('--sheet-drag-y')).toBe('120px');

    firePointer(sheetDragArea, 'pointerup', 240);

    expect(panelDock.className).toContain('isSheetLowered');
    expect(panelDock.style.getPropertyValue('--sheet-base-y')).toBe('calc(100% - 124px)');
    expect(panelDock.style.getPropertyValue('--sheet-drag-y')).toBe('0px');
    expect(screen.getByTestId('selected-store-detail')).toBeTruthy();

    firePointer(sheetDragArea, 'pointerdown', 240);
    firePointer(sheetDragArea, 'pointerup', 240);

    expect(panelDock.className).not.toContain('isSheetLowered');
  });

  it('keeps the mobile coupon sheet at the middle when dragged upward', () => {
    mockMobileViewport();

    const { container } = render(<CouponMapScreen view={VIEW} status="ready" message={null} />);
    const sheetDragArea = container.querySelector('.sheetDragArea') as HTMLElement;
    const panelDock = container.querySelector('.panelDock') as HTMLElement;

    firePointer(sheetDragArea, 'pointerdown', 240);
    firePointer(sheetDragArea, 'pointermove', 120);

    expect(panelDock.style.getPropertyValue('--sheet-drag-y')).toBe('0px');

    firePointer(sheetDragArea, 'pointerup', 120);

    expect(panelDock.className).not.toContain('isSheetExpanded');
    expect(panelDock.className).not.toContain('isSheetLowered');
  });

  it('restores the lowered mobile coupon sheet when dragged upward', () => {
    mockMobileViewport();

    const { container } = render(<CouponMapScreen view={VIEW} status="ready" message={null} />);
    const sheetDragArea = container.querySelector('.sheetDragArea') as HTMLElement;
    const panelDock = container.querySelector('.panelDock') as HTMLElement;

    firePointer(sheetDragArea, 'pointerdown', 120);
    firePointer(sheetDragArea, 'pointermove', 240);
    firePointer(sheetDragArea, 'pointerup', 240);

    expect(panelDock.className).toContain('isSheetLowered');

    firePointer(sheetDragArea, 'pointerdown', 240);
    firePointer(sheetDragArea, 'pointermove', 120);

    expect(panelDock.style.getPropertyValue('--sheet-drag-y')).toBe('-120px');

    firePointer(sheetDragArea, 'pointerup', 120);

    expect(panelDock.className).not.toContain('isSheetExpanded');
    expect(panelDock.className).not.toContain('isSheetLowered');
  });

  it('keeps the middle mobile coupon sheet in place when the map is tapped', () => {
    mockMobileViewport();

    const { container } = render(<CouponMapScreen view={VIEW} status="ready" message={null} />);
    const sheetDragArea = container.querySelector('.sheetDragArea') as HTMLElement;
    const panelDock = container.querySelector('.panelDock') as HTMLElement;
    const mapCanvas = container.querySelector('.mapCanvas') as HTMLElement;

    firePointer(sheetDragArea, 'pointerdown', 240);
    firePointer(sheetDragArea, 'pointermove', 120);
    firePointer(sheetDragArea, 'pointerup', 120);

    expect(panelDock.className).not.toContain('isSheetExpanded');

    fireEvent.click(mapCanvas);

    expect(panelDock.className).not.toContain('isSheetExpanded');
    expect(panelDock.className).not.toContain('isSheetLowered');
    expect(panelDock.style.getPropertyValue('--sheet-base-y')).toBe('0px');
  });

  it('keeps the empty state visible when there are no stores', () => {
    render(
      <CouponMapScreen
        view={{ stores: [], totals: { brands: 0, stores: 0, activeCoupons: 0 } }}
        status="empty"
        message="Supabase에 표시 가능한 쿠폰 데이터가 없습니다."
      />
    );

    expect(screen.getByText('Supabase에 표시 가능한 쿠폰 데이터가 없습니다.')).toBeTruthy();
    expect(screen.getByText('표시할 쿠폰이 없습니다')).toBeTruthy();
    expect(screen.queryByTestId('selected-store-detail')).toBeNull();
  });

  it('submits selected coupon feedback without showing the coupon context in the dialog', async () => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        watchPosition: vi.fn(() => 12),
        clearWatch: vi.fn(),
      },
    });
    const fetchMock = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) =>
      Promise.resolve({
        ok: true,
        status: 201,
        json: () => Promise.resolve({ ok: true }),
      } as Response)
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<CouponMapScreen view={VIEW} status="ready" message={null} />);

    fireEvent.click(screen.getByRole('button', { name: '정보 수정 제안' }));

    const dialog = screen.getByRole('dialog', { name: '피드백 보내기' });
    expect(dialog).toBeTruthy();
    expect(within(dialog).queryByText('맥도날드 홍대점')).toBeNull();
    expect(within(dialog).queryByText('빅맥 20%')).toBeNull();

    fireEvent.change(screen.getByLabelText('내용'), {
      target: { value: ' 빅맥 쿠폰 조건이 실제 앱과 달라요. ' },
    });
    fireEvent.click(screen.getByRole('button', { name: '보내기' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/feedback');
    expect(options?.method).toBe('POST');

    const payload = JSON.parse(String(options?.body));
    expect(payload).toMatchObject({
      type: 'coupon_incorrect',
      message: '빅맥 쿠폰 조건이 실제 앱과 달라요.',
      storeId: 'hongdae',
      couponId: 'bigmac',
      brandId: 'brand-mcdonalds',
      brandName: '맥도날드',
      pagePath: '/',
      searchRadiusMeters: 1000,
    });
    expect(screen.getByText('피드백을 보냈습니다')).toBeTruthy();
    expect(trackAmplitudeEvent).toHaveBeenCalledWith(
      'feedback_submitted',
      expect.objectContaining({
        brand_id: 'brand-mcdonalds',
        coupon_id: 'bigmac',
        feedback_type: 'coupon_incorrect',
        search_radius_meters: 1000,
        store_id: 'hongdae',
      })
    );
  });

  it('does not render the old illustrated map fallback before the map provider is ready', () => {
    const { container } = render(<CouponMapScreen view={VIEW} status="ready" message={null} />);

    expect(container.querySelector('.mapBackdrop')).toBeNull();
    expect(container.querySelector('.mapStatus')).toBeTruthy();
  });

  it('keeps Kakao-projected store markers anchored on mobile camera moves', async () => {
    vi.stubEnv('NEXT_PUBLIC_KAKAO_MAP_APP_KEY', 'test-key');
    mockMobileViewport();
    mockAnimationFrame();
    mockKakaoMaps();

    render(<CouponMapScreen view={VIEW} status="ready" message={null} />);

    const marker = await screen.findByRole('button', { name: '맥도날드 홍대점 20%' });

    await waitFor(() => {
      expect(marker.className).toContain('isProjected');
      expect(marker.style.getPropertyValue('--pin-x')).toMatch(/px$/);
      expect(marker.style.getPropertyValue('--pin-y')).toMatch(/px$/);
    });
    expect(latestKakaoMap?.getLevel()).toBe(5);
    expect(marker.style.getPropertyValue('--pin-mobile-x')).toBe('');
    expect(marker.style.getPropertyValue('--pin-mobile-y')).toBe('');

    await act(async () => {
      latestKakaoMap?.moveCameraTo(VIEW.stores[0].lat, VIEW.stores[0].lng);
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    await waitFor(() => {
      expect(marker.style.getPropertyValue('--pin-x')).toBe('400px');
      expect(marker.style.getPropertyValue('--pin-y')).toBe('300px');
    });

    const styleText = [...document.querySelectorAll('style')]
      .map((style) => style.textContent ?? '')
      .join('\n');
    expect(styleText).toContain('.marker:not(.isProjected)');
  });

  it('keeps the mobile camera anchored to the user when coupon stores are outside the search radius', async () => {
    vi.stubEnv('NEXT_PUBLIC_KAKAO_MAP_APP_KEY', 'test-key');
    mockMobileViewport();
    mockAnimationFrame();
    mockKakaoMaps();
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        watchPosition: vi.fn((onSuccess: PositionCallback) => {
          onSuccess({
            coords: {
              latitude: 37.4979123,
              longitude: 127.0276123,
            },
          } as GeolocationPosition);
          return 7;
        }),
        clearWatch: vi.fn(),
      },
    });
    const fetchMock = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            view: {
              stores: [VIEW.stores[0]],
              totals: {
                brands: 1,
                stores: 1,
                activeCoupons: 2,
              },
            },
            status: 'ready',
            message: null,
          }),
      } as Response)
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<CouponMapScreen view={VIEW} status="ready" message={null} />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      expect(latestKakaoMap?.getCenter().getLat()).toBeCloseTo(37.4979123, 4);
      expect(latestKakaoMap?.getCenter().getLng()).toBeCloseTo(127.0276123, 4);
      expect(latestKakaoMap?.getLevel()).toBe(5);
    });
  });

  it('centers a selected mobile store without bottom-sheet midpoint offset', async () => {
    vi.stubEnv('NEXT_PUBLIC_KAKAO_MAP_APP_KEY', 'test-key');
    mockMobileViewport();
    mockAnimationFrame();
    mockKakaoMaps();

    render(<CouponMapScreen view={VIEW} status="ready" message={null} />);

    const gangnamMarker = await screen.findByRole('button', {
      name: '버거킹 강남점 3,000원',
    });

    await waitFor(() => {
      expect(gangnamMarker.className).toContain('isProjected');
    });

    fireEvent.click(gangnamMarker);

    const selectedPoint = latestKakaoMap
      ?.getProjection()
      .containerPointFromCoords(new MockKakaoLatLng(VIEW.stores[1].lat, VIEW.stores[1].lng));

    expect(selectedPoint).toEqual({ x: 400, y: 300 });
    expect(latestKakaoMap?.getCenter().getLat()).toBe(VIEW.stores[1].lat);
    expect(latestKakaoMap?.getCenter().getLng()).toBe(VIEW.stores[1].lng);
  });

  it('keeps a selected desktop store centered in the visible map area as the right panel opens and closes', async () => {
    vi.stubEnv('NEXT_PUBLIC_KAKAO_MAP_APP_KEY', 'test-key');
    mockAnimationFrame();
    mockKakaoMaps();

    render(<CouponMapScreen view={VIEW} status="ready" message={null} />);

    const gangnamMarker = await screen.findByRole('button', {
      name: '버거킹 강남점 3,000원',
    });

    await waitFor(() => {
      expect(gangnamMarker.className).toContain('isProjected');
    });

    fireEvent.click(gangnamMarker);

    const projectGangnam = () =>
      latestKakaoMap
        ?.getProjection()
        .containerPointFromCoords(new MockKakaoLatLng(VIEW.stores[1].lat, VIEW.stores[1].lng));

    expect(projectGangnam()).toEqual({ x: 186, y: 300 });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '쿠폰 패널 닫기' }));
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(screen.getByRole('button', { name: '쿠폰 패널 열기' })).toBeTruthy();
    expect(projectGangnam()).toEqual({ x: 400, y: 300 });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '쿠폰 패널 열기' }));
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(screen.getByRole('button', { name: '쿠폰 패널 닫기' })).toBeTruthy();
    expect(projectGangnam()).toEqual({ x: 186, y: 300 });
  });

  it('reloads coupon data when the browser reports a moved location', async () => {
    mockLocalStorage();
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        watchPosition: vi.fn((onSuccess: PositionCallback) => {
          onSuccess({
            coords: {
              latitude: 37.4979123,
              longitude: 127.0276123,
            },
          } as GeolocationPosition);
          return 7;
        }),
        clearWatch: vi.fn(),
      },
    });
    const nextView: CouponMapView = {
      stores: [VIEW.stores[1], VIEW.stores[0]],
      totals: {
        brands: 2,
        stores: 2,
        activeCoupons: 3,
      },
    };
    const fetchMock = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            view: nextView,
            status: 'ready',
            message: null,
          }),
      } as Response)
    );
    vi.stubGlobal('fetch', fetchMock);

    const { container } = render(<CouponMapScreen view={VIEW} status="ready" message={null} />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(window.localStorage.getItem(USER_LOCATION_STORAGE_KEY)).toContain('37.4979123');

    const requestedUrl = String(fetchMock.mock.calls[0]?.[0] ?? '');
    expect(requestedUrl).toContain('/api/coupon-map?');
    expect(requestedUrl).toContain('lat=37.4979');
    expect(requestedUrl).toContain('lng=127.0276');
    expect(requestedUrl).toContain('radiusMeters=1000');

    await waitFor(() =>
      expect(screen.getByTestId('selected-store-detail').getAttribute('data-selected-store-id')).toBe(
        'gangnam'
      )
    );
    const couponRows = container.querySelectorAll('.couponListRow');
    expect(couponRows[0]?.getAttribute('aria-label')).toBe(
      '버거킹 강남점 와퍼 3,000원 할인 3,000원'
    );
    expect(screen.getByRole('button', { name: '맥도날드 홍대점 20%' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '버거킹 강남점 3,000원' })).toBeTruthy();
  });

  it('starts from a stored user location without prompting geolocation again', async () => {
    mockLocalStorage();
    const watchPosition = vi.fn();
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        watchPosition,
        clearWatch: vi.fn(),
      },
    });
    window.localStorage.setItem(
      USER_LOCATION_STORAGE_KEY,
      JSON.stringify({ lat: 37.4979123, lng: 127.0276123, savedAt: Date.now() })
    );
    const nextView: CouponMapView = {
      stores: [VIEW.stores[1], VIEW.stores[0]],
      totals: {
        brands: 2,
        stores: 2,
        activeCoupons: 3,
      },
    };
    const fetchMock = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            view: nextView,
            status: 'ready',
            message: null,
          }),
      } as Response)
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<CouponMapScreen view={VIEW} status="ready" message={null} />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(watchPosition).not.toHaveBeenCalled();

    const requestedUrl = String(fetchMock.mock.calls[0]?.[0] ?? '');
    expect(requestedUrl).toContain('/api/coupon-map?');
    expect(requestedUrl).toContain('lat=37.4979');
    expect(requestedUrl).toContain('lng=127.0276');
    await waitFor(() =>
      expect(screen.getByTestId('selected-store-detail').getAttribute('data-selected-store-id')).toBe(
        'hongdae'
      )
    );
  });

  it('refreshes a stored location from the locate button before reloading coupons', async () => {
    mockLocalStorage();
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: vi.fn((onSuccess: PositionCallback) => {
          onSuccess({
            coords: {
              latitude: 37.4979123,
              longitude: 127.0276123,
            },
          } as GeolocationPosition);
        }),
        watchPosition: vi.fn(),
        clearWatch: vi.fn(),
      },
    });
    window.localStorage.setItem(
      USER_LOCATION_STORAGE_KEY,
      JSON.stringify({ lat: 37.5563, lng: 126.9236, savedAt: Date.now() })
    );
    const fetchMock = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            view: {
              stores: [VIEW.stores[1], VIEW.stores[0]],
              totals: {
                brands: 2,
                stores: 2,
                activeCoupons: 3,
              },
            },
            status: 'ready',
            message: null,
          }),
      } as Response)
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<CouponMapScreen view={VIEW} status="ready" message={null} />);

    fireEvent.click(screen.getByRole('button', { name: '현재 위치 갱신' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const requestedUrl = String(fetchMock.mock.calls[0]?.[0] ?? '');
    expect(requestedUrl).toContain('/api/coupon-map?');
    expect(requestedUrl).toContain('lat=37.4979');
    expect(requestedUrl).toContain('lng=127.0276');
    expect(window.localStorage.getItem(USER_LOCATION_STORAGE_KEY)).toContain('37.4979123');
  });

  it('forces a current-location reload from the map locate button', async () => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        watchPosition: vi.fn((onSuccess: PositionCallback) => {
          onSuccess({
            coords: {
              latitude: 37.4979123,
              longitude: 127.0276123,
            },
          } as GeolocationPosition);
          return 7;
        }),
        clearWatch: vi.fn(),
      },
    });
    const nextView: CouponMapView = {
      stores: [VIEW.stores[1], VIEW.stores[0]],
      totals: {
        brands: 2,
        stores: 2,
        activeCoupons: 3,
      },
    };
    const fetchMock = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            view: nextView,
            status: 'ready',
            message: null,
          }),
      } as Response)
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<CouponMapScreen view={VIEW} status="ready" message={null} />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: '현재 위치로 이동' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const requestedUrl = String(fetchMock.mock.calls[1]?.[0] ?? '');
    expect(requestedUrl).toContain('/api/coupon-map?');
    expect(requestedUrl).toContain('lat=37.4979');
    expect(requestedUrl).toContain('lng=127.0276');
    expect(requestedUrl).toContain('radiusMeters=1000');
    expect(screen.getByTestId('selected-store-detail').getAttribute('data-selected-store-id')).toBe(
      'gangnam'
    );
  });
});
