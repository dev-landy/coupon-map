import type { Coupon, DiscountType } from './types';

/**
 * Coupon filtering and ranking.
 *
 * All functions are pure and never mutate their inputs.
 */

/**
 * Keep only coupons that are usable right now:
 *  - is_active must be true, and
 *  - valid_until must be today or later (null = never expires, kept).
 *
 * `now` is injected so the logic is deterministic and testable.
 * Comparison is by calendar day: a coupon valid_until today is still valid
 * for the whole of that day.
 */
export function filterActiveCoupons(coupons: readonly Coupon[], now: Date): Coupon[] {
  const todayStart = startOfDay(now).getTime();
  return coupons.filter((coupon) => {
    if (!coupon.is_active) return false;
    if (coupon.valid_until === null) return true;
    const expiry = parseDateOnly(coupon.valid_until);
    if (expiry === null) return false; // malformed date -> treat as unusable
    return expiry.getTime() >= todayStart;
  });
}

/**
 * Sort coupons by discount attractiveness, most attractive first.
 *
 * NORMALIZATION ASSUMPTION (read carefully):
 * We cannot perfectly compare a 정액(fixed amount, e.g. ₩2,000 off) against a
 * 정률(percent, e.g. 20% off) or a 세트(set price, e.g. ₩5,900 combo) without
 * knowing the original item price, which we do not store. Rather than invent a
 * fake "effective discount" from missing data, we use a deliberately simple,
 * stable, and explainable heuristic:
 *
 *   1. Rank by TYPE PRIORITY first. 정률 (percent) scales with spend and tends
 *      to be the most attractive for the price-sensitive lunch user, so it
 *      ranks highest; 정액 (a guaranteed won amount) next; 세트 (a bundle price,
 *      the hardest to compare and often a smaller effective saving) last.
 *        정률 > 정액 > 세트
 *   2. WITHIN a type, sort by discount_value descending:
 *        - 정률: higher percent is better.
 *        - 정액: higher won amount off is better.
 *        - 세트: LOWER set price is better, so we invert (cheaper set first).
 *   3. Ties break by title (locale-aware) then id, so ordering is stable and
 *      deterministic across runs.
 *
 * This is intentionally a heuristic, not a true value comparison. If/when we
 * store original prices we should replace step 1 with a real effective-saving
 * computation. Until then: explicit and predictable over clever-but-wrong.
 */
export function sortByDiscount(coupons: readonly Coupon[]): Coupon[] {
  return [...coupons].sort((a, b) => {
    const typeDelta = TYPE_PRIORITY[a.discount_type] - TYPE_PRIORITY[b.discount_type];
    if (typeDelta !== 0) return typeDelta;

    const valueDelta = withinTypeRank(b) - withinTypeRank(a);
    if (valueDelta !== 0) return valueDelta;

    const titleDelta = a.title.localeCompare(b.title);
    if (titleDelta !== 0) return titleDelta;

    return a.id.localeCompare(b.id);
  });
}

/** Lower number = ranked earlier (more attractive). */
const TYPE_PRIORITY: Record<DiscountType, number> = {
  정률: 0,
  정액: 1,
  세트: 2,
};

/**
 * A higher return value means "more attractive within the same type".
 * For 세트 a lower price is better, so we negate it.
 */
function withinTypeRank(coupon: Coupon): number {
  return coupon.discount_type === '세트' ? -coupon.discount_value : coupon.discount_value;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Parse a YYYY-MM-DD string into a local-midnight Date, or null if invalid. */
function parseDateOnly(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  // Reject overflow like 2024-13-40 that Date silently rolls over.
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}
