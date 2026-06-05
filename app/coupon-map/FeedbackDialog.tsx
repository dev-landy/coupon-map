export type FeedbackType =
  | 'coupon_incorrect'
  | 'store_location'
  | 'app_problem'
  | 'feature_request'
  | 'other';

export type FeedbackSubmitStatus = 'idle' | 'submitting' | 'success' | 'error';

const FEEDBACK_TYPE_OPTIONS: Array<{ value: FeedbackType; label: string }> = [
  { value: 'coupon_incorrect', label: '쿠폰 정보 오류' },
  { value: 'store_location', label: '매장 위치 오류' },
  { value: 'app_problem', label: '앱 사용 문제' },
  { value: 'feature_request', label: '기능 제안' },
  { value: 'other', label: '기타' },
];

export function FeedbackDialog({
  type,
  message,
  contact,
  status,
  error,
  onTypeChange,
  onMessageChange,
  onContactChange,
  onSubmit,
  onClose,
}: {
  type: FeedbackType;
  message: string;
  contact: string;
  status: FeedbackSubmitStatus;
  error: string | null;
  onTypeChange: (type: FeedbackType) => void;
  onMessageChange: (message: string) => void;
  onContactChange: (contact: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
}) {
  const isSubmitting = status === 'submitting';
  const isSuccess = status === 'success';

  return (
    <div className="feedbackOverlay" role="presentation">
      <form
        className="feedbackDialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-title"
        onSubmit={onSubmit}
      >
        <div className="feedbackHeader">
          <div>
            <p className="eyebrow">Feedback</p>
            <h2 id="feedback-title">피드백 보내기</h2>
          </div>
          <button
            type="button"
            className="feedbackCloseButton"
            aria-label="피드백 닫기"
            onClick={onClose}
            disabled={isSubmitting}
          >
            ×
          </button>
        </div>

        {isSuccess ? (
          <div className="feedbackSuccess" role="status">
            <strong>피드백을 보냈습니다</strong>
            <span>확인 후 쿠폰맵에 반영하겠습니다.</span>
          </div>
        ) : (
          <>
            <label className="feedbackField">
              <span>유형</span>
              <select
                value={type}
                onChange={(event) => onTypeChange(event.target.value as FeedbackType)}
                disabled={isSubmitting}
              >
                {FEEDBACK_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="feedbackField">
              <span>내용</span>
              <textarea
                value={message}
                minLength={3}
                maxLength={1000}
                rows={5}
                placeholder="잘못된 쿠폰 조건, 누락된 매장, 오류 상황 등을 알려주세요."
                onChange={(event) => onMessageChange(event.target.value)}
                disabled={isSubmitting}
                required
              />
            </label>

            <label className="feedbackField">
              <span>연락처</span>
              <input
                value={contact}
                maxLength={160}
                placeholder="선택 입력"
                onChange={(event) => onContactChange(event.target.value)}
                disabled={isSubmitting}
              />
            </label>

            <input
              className="feedbackTrap"
              type="text"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
            />

            {error ? (
              <p className="feedbackError" role="alert">
                {error}
              </p>
            ) : null}
          </>
        )}

        <div className="feedbackActions">
          <button
            type="button"
            className="feedbackSecondaryButton"
            onClick={onClose}
            disabled={isSubmitting}
          >
            닫기
          </button>
          {!isSuccess ? (
            <button
              type="submit"
              className="feedbackSubmitButton"
              disabled={isSubmitting || message.trim().length < 3}
            >
              {isSubmitting ? '보내는 중' : '보내기'}
            </button>
          ) : null}
        </div>
      </form>
    </div>
  );
}
