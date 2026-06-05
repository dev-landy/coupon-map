import type { MapProviderStatus } from '../../lib/kakaoMap';

export function MapStatusOverlay({ status }: { status: MapProviderStatus }) {
  const label = formatMapStatusLabel(status);

  return (
    <div className={`mapStatus mapStatus-${status}`} role={status === 'loading' ? 'status' : 'note'}>
      {status === 'loading' ? <span className="mapStatusSpinner" aria-hidden="true" /> : null}
      <span>{label}</span>
    </div>
  );
}

function formatMapStatusLabel(status: MapProviderStatus): string {
  if (status === 'missing-key') return '지도 키가 설정되지 않았습니다';
  if (status === 'error') return '지도를 불러오지 못했습니다';
  return '지도를 준비 중입니다';
}
