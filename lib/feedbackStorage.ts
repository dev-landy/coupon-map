/** localStorage-backed cooldown for feedback submissions (best-effort, non-blocking). */

const FEEDBACK_COOLDOWN_STORAGE_KEY = 'coupon-map-feedback-last-submitted-at';
export const FEEDBACK_COOLDOWN_MS = 30 * 1000;

export function readLastFeedbackSubmittedAt(): number | null {
  if (typeof window === 'undefined') return null;

  try {
    const value = window.localStorage.getItem(FEEDBACK_COOLDOWN_STORAGE_KEY);
    if (!value) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeLastFeedbackSubmittedAt(value: number) {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(FEEDBACK_COOLDOWN_STORAGE_KEY, String(value));
  } catch {
    // Storage can be disabled; feedback submission should still succeed.
  }
}
