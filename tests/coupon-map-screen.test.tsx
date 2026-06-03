import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import CouponMapScreen from '../app/CouponMapScreen';
import type { CouponMapView } from '../lib/frontendData';

vi.mock('../lib/deeplink', () => ({
  openBrandApp: vi.fn(),
}));

const { openBrandApp } = await import('../lib/deeplink');
const originalGeolocation = navigator.geolocation;
const originalMatchMedia = window.matchMedia;

afterEach(() => {
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: originalGeolocation,
  });
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: originalMatchMedia,
  });
  vi.unstubAllGlobals();
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
        app_scheme: 'mcdonaldskr://',
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
        app_scheme: 'burgerkingkorea://',
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
        app_scheme: 'kfc_ko.kore.kg.kfc_korea://',
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

    fireEvent.click(screen.getByRole('button', { name: '앱에서 열기' }));

    expect(openBrandApp).toHaveBeenLastCalledWith(
      VIEW.stores[0].brand,
      undefined,
      'mcdonaldskr://coupon/fries'
    );
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

  it('expands the mobile coupon sheet to the top when dragged upward', () => {
    mockMobileViewport();

    const { container } = render(<CouponMapScreen view={VIEW} status="ready" message={null} />);
    const sheetDragArea = container.querySelector('.sheetDragArea') as HTMLElement;
    const panelDock = container.querySelector('.panelDock') as HTMLElement;

    firePointer(sheetDragArea, 'pointerdown', 240);
    firePointer(sheetDragArea, 'pointermove', 120);

    expect(panelDock.style.getPropertyValue('--sheet-drag-y')).toBe('-120px');

    firePointer(sheetDragArea, 'pointerup', 120);

    expect(panelDock.className).toContain('isSheetExpanded');
    expect(panelDock.className).not.toContain('isSheetLowered');

    firePointer(sheetDragArea, 'pointerdown', 120);
    firePointer(sheetDragArea, 'pointermove', 220);
    firePointer(sheetDragArea, 'pointerup', 220);

    expect(panelDock.className).not.toContain('isSheetExpanded');
  });

  it('lowers the expanded mobile coupon sheet when the map is tapped', () => {
    mockMobileViewport();

    const { container } = render(<CouponMapScreen view={VIEW} status="ready" message={null} />);
    const sheetDragArea = container.querySelector('.sheetDragArea') as HTMLElement;
    const panelDock = container.querySelector('.panelDock') as HTMLElement;
    const mapCanvas = container.querySelector('.mapCanvas') as HTMLElement;

    firePointer(sheetDragArea, 'pointerdown', 240);
    firePointer(sheetDragArea, 'pointermove', 120);
    firePointer(sheetDragArea, 'pointerup', 120);

    expect(panelDock.className).toContain('isSheetExpanded');

    fireEvent.click(mapCanvas);

    expect(panelDock.className).not.toContain('isSheetExpanded');
    expect(panelDock.className).toContain('isSheetLowered');
    expect(panelDock.style.getPropertyValue('--sheet-base-y')).toBe('calc(100% - 124px)');
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

  it('does not render the old illustrated map fallback before the map provider is ready', () => {
    const { container } = render(<CouponMapScreen view={VIEW} status="ready" message={null} />);

    expect(container.querySelector('.mapBackdrop')).toBeNull();
    expect(container.querySelector('.mapStatus')).toBeTruthy();
  });

  it('reloads coupon data when the browser reports a moved location', async () => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        watchPosition: vi.fn((onSuccess: PositionCallback) => {
          onSuccess({
            coords: {
              latitude: 37.4979,
              longitude: 127.0276,
            },
          } as GeolocationPosition);
          return 7;
        }),
        clearWatch: vi.fn(),
      },
    });
    const nextView: CouponMapView = {
      stores: [VIEW.stores[1]],
      totals: {
        brands: 1,
        stores: 1,
        activeCoupons: 1,
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
    expect(screen.queryByRole('button', { name: '맥도날드 홍대점 20%' })).toBeNull();
    expect(screen.getByRole('button', { name: '버거킹 강남점 3,000원' })).toBeTruthy();
  });
});
