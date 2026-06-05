import { useCallback, useEffect, useState } from 'react';

import {
  FEEDBACK_COOLDOWN_MS,
  readLastFeedbackSubmittedAt,
  writeLastFeedbackSubmittedAt,
} from '../../lib/feedbackStorage';
import type { CouponMapCoupon, CouponMapStore } from '../../lib/frontendData';
import type { FeedbackSubmitStatus, FeedbackType } from './FeedbackDialog';

interface UseFeedbackFormArgs {
  selectedStore: CouponMapStore | null;
  selectedCoupon: CouponMapCoupon | null;
  searchRadiusMeters: number;
}

export function useFeedbackForm({
  selectedStore,
  selectedCoupon,
  searchRadiusMeters,
}: UseFeedbackFormArgs) {
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [feedbackType, setFeedbackType] = useState<FeedbackType>('coupon_incorrect');
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [feedbackContact, setFeedbackContact] = useState('');
  const [feedbackSubmitStatus, setFeedbackSubmitStatus] =
    useState<FeedbackSubmitStatus>('idle');
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  const openFeedback = useCallback(
    (initialType: FeedbackType = selectedStore ? 'coupon_incorrect' : 'feature_request') => {
      setFeedbackType(initialType);
      setFeedbackSubmitStatus('idle');
      setFeedbackError(null);
      setIsFeedbackOpen(true);
    },
    [selectedStore]
  );

  const closeFeedback = useCallback(() => {
    if (feedbackSubmitStatus === 'submitting') return;
    setIsFeedbackOpen(false);
    setFeedbackSubmitStatus('idle');
    setFeedbackError(null);
  }, [feedbackSubmitStatus]);

  useEffect(() => {
    if (!isFeedbackOpen) return;

    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeFeedback();
    };

    document.addEventListener('keydown', handleKeydown);
    return () => document.removeEventListener('keydown', handleKeydown);
  }, [closeFeedback, isFeedbackOpen]);

  const submitFeedback = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      const formData = new FormData(event.currentTarget);
      const spamTrap = String(formData.get('website') ?? '').trim();
      if (spamTrap) {
        setFeedbackSubmitStatus('success');
        setFeedbackError(null);
        return;
      }

      const trimmedMessage = feedbackMessage.trim();
      const trimmedContact = feedbackContact.trim();
      if (trimmedMessage.length < 3) {
        setFeedbackSubmitStatus('error');
        setFeedbackError('내용을 조금 더 적어주세요.');
        return;
      }

      const now = Date.now();
      const lastSubmittedAt = readLastFeedbackSubmittedAt();
      if (lastSubmittedAt !== null && now - lastSubmittedAt < FEEDBACK_COOLDOWN_MS) {
        setFeedbackSubmitStatus('error');
        setFeedbackError('잠시 후 다시 보내주세요.');
        return;
      }

      setFeedbackSubmitStatus('submitting');
      setFeedbackError(null);

      try {
        const response = await fetch('/api/feedback', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            type: feedbackType,
            message: trimmedMessage,
            contact: trimmedContact || undefined,
            storeId: selectedStore?.id,
            couponId: selectedCoupon?.id,
            brandId: selectedStore?.brand.id,
            brandName: selectedStore?.brandName,
            pagePath: getCurrentPagePath(),
            searchRadiusMeters,
          }),
        });

        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as { message?: unknown } | null;
          throw new Error(
            typeof body?.message === 'string' ? body.message : '피드백을 보내지 못했습니다.'
          );
        }

        writeLastFeedbackSubmittedAt(now);
        setFeedbackSubmitStatus('success');
        setFeedbackError(null);
        setFeedbackMessage('');
        setFeedbackContact('');
      } catch (error) {
        setFeedbackSubmitStatus('error');
        setFeedbackError(
          error instanceof Error ? error.message : '피드백을 보내지 못했습니다.'
        );
      }
    },
    [
      feedbackContact,
      feedbackMessage,
      feedbackType,
      searchRadiusMeters,
      selectedCoupon,
      selectedStore,
    ]
  );

  return {
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
  };
}

function getCurrentPagePath(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  return `${window.location.pathname}${window.location.search}`;
}
