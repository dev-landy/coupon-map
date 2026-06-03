import { describe, it, expect } from 'vitest';
import { filterActiveCoupons, sortByDiscount } from '../lib/coupons';
import type { Coupon } from '../lib/types';

function makeCoupon(overrides: Partial<Coupon> = {}): Coupon {
  return {
    id: 'c1',
    brand_id: 'b1',
    title: 'Coupon',
    discount_type: '정률',
    discount_value: 10,
    valid_until: '2026-12-31',
    is_active: true,
    ...overrides,
  };
}

describe('filterActiveCoupons', () => {
  const NOW = new Date(2026, 5, 1); // 2026-06-01 local

  it('drops coupons whose valid_until is before today', () => {
    // Arrange
    const expired = makeCoupon({ id: 'expired', valid_until: '2026-05-31' });
    const valid = makeCoupon({ id: 'valid', valid_until: '2026-06-02' });

    // Act
    const result = filterActiveCoupons([expired, valid], NOW);

    // Assert
    expect(result.map((c) => c.id)).toEqual(['valid']);
  });

  it('keeps a coupon that expires today (valid through the whole day)', () => {
    // Arrange
    const today = makeCoupon({ id: 'today', valid_until: '2026-06-01' });

    // Act
    const result = filterActiveCoupons([today], NOW);

    // Assert
    expect(result.map((c) => c.id)).toEqual(['today']);
  });

  it('drops inactive coupons even when not expired', () => {
    // Arrange
    const inactive = makeCoupon({ id: 'inactive', is_active: false });

    // Act
    const result = filterActiveCoupons([inactive], NOW);

    // Assert
    expect(result).toEqual([]);
  });

  it('keeps coupons with no expiry (valid_until null)', () => {
    // Arrange
    const evergreen = makeCoupon({ id: 'evergreen', valid_until: null });

    // Act
    const result = filterActiveCoupons([evergreen], NOW);

    // Assert
    expect(result.map((c) => c.id)).toEqual(['evergreen']);
  });

  it('drops coupons with a malformed valid_until date', () => {
    // Arrange
    const malformed = makeCoupon({ id: 'bad', valid_until: 'not-a-date' });

    // Act
    const result = filterActiveCoupons([malformed], NOW);

    // Assert
    expect(result).toEqual([]);
  });

  it('returns an empty array for empty input and does not mutate input', () => {
    // Arrange
    const input: Coupon[] = [];

    // Act
    const result = filterActiveCoupons(input, NOW);

    // Assert
    expect(result).toEqual([]);
    expect(result).not.toBe(input);
  });
});

describe('sortByDiscount', () => {
  it('ranks types 정률 > 정액 > 세트', () => {
    // Arrange
    const set = makeCoupon({ id: 'set', discount_type: '세트', discount_value: 5900 });
    const amount = makeCoupon({ id: 'amount', discount_type: '정액', discount_value: 2000 });
    const percent = makeCoupon({ id: 'percent', discount_type: '정률', discount_value: 20 });

    // Act
    const result = sortByDiscount([set, amount, percent]);

    // Assert
    expect(result.map((c) => c.id)).toEqual(['percent', 'amount', 'set']);
  });

  it('within 정률 sorts higher percent first', () => {
    // Arrange
    const low = makeCoupon({ id: 'low', discount_type: '정률', discount_value: 10 });
    const high = makeCoupon({ id: 'high', discount_type: '정률', discount_value: 30 });

    // Act
    const result = sortByDiscount([low, high]);

    // Assert
    expect(result.map((c) => c.id)).toEqual(['high', 'low']);
  });

  it('within 정액 sorts higher won amount first', () => {
    // Arrange
    const small = makeCoupon({ id: 'small', discount_type: '정액', discount_value: 1000 });
    const big = makeCoupon({ id: 'big', discount_type: '정액', discount_value: 3000 });

    // Act
    const result = sortByDiscount([small, big]);

    // Assert
    expect(result.map((c) => c.id)).toEqual(['big', 'small']);
  });

  it('within 세트 sorts cheaper set price first', () => {
    // Arrange
    const pricey = makeCoupon({ id: 'pricey', discount_type: '세트', discount_value: 9900 });
    const cheap = makeCoupon({ id: 'cheap', discount_type: '세트', discount_value: 4900 });

    // Act
    const result = sortByDiscount([pricey, cheap]);

    // Assert
    expect(result.map((c) => c.id)).toEqual(['cheap', 'pricey']);
  });

  it('breaks ties deterministically by title then id', () => {
    // Arrange
    const a = makeCoupon({ id: 'id-a', title: 'Alpha', discount_type: '정률', discount_value: 10 });
    const b = makeCoupon({ id: 'id-b', title: 'Beta', discount_type: '정률', discount_value: 10 });

    // Act
    const result = sortByDiscount([b, a]);

    // Assert
    expect(result.map((c) => c.id)).toEqual(['id-a', 'id-b']);
  });

  it('returns an empty array for empty input and does not mutate input', () => {
    // Arrange
    const input: Coupon[] = [makeCoupon()];
    const snapshot = [...input];

    // Act
    const result = sortByDiscount(input);

    // Assert
    expect(result).not.toBe(input);
    expect(input).toEqual(snapshot);
    expect(sortByDiscount([])).toEqual([]);
  });
});
