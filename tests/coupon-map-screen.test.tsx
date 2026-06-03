import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import CouponMapScreen from '../app/CouponMapScreen';
import type { CouponMapView } from '../lib/frontendData';

vi.mock('../lib/deeplink', () => ({
  openBrandApp: vi.fn(),
}));

const { openBrandApp } = await import('../lib/deeplink');

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
    activeCoupons: 2,
  },
};

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
});
