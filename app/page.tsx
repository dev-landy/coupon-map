import { buildCouponMapView } from '../lib/frontendData';
import { loadCouponRows } from '../lib/couponMapData';
import { formatNearbyEmptyMessage } from '../lib/format';
import { DEFAULT_LOCATION } from '../lib/location';
import { buildHomePageJsonLd, serializeJsonLd } from '../lib/seo';
import { DEFAULT_RADIUS_METERS } from '../lib/stores';
import CouponMapScreen from './CouponMapScreen';
import type { AmplitudeConfig } from '../lib/amplitude';

export const revalidate = 300;

export default async function HomePage() {
  const state = await loadCouponRows();
  const view = buildCouponMapView(state.rows, new Date(), {
    center: DEFAULT_LOCATION,
    radiusMeters: DEFAULT_RADIUS_METERS,
  });
  const status = state.status === 'ready' && view.stores.length === 0 ? 'empty' : state.status;
  const message =
    state.message ??
    (view.stores.length === 0 ? formatNearbyEmptyMessage(DEFAULT_RADIUS_METERS) : null);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(buildHomePageJsonLd(view)) }}
      />
      <CouponMapScreen
        view={view}
        status={status}
        message={message}
        amplitudeConfig={readAmplitudeConfig()}
      />
    </>
  );
}

function readAmplitudeConfig(): AmplitudeConfig {
  return {
    apiKey: process.env.AMPLITUDE_API_KEY?.trim() || null,
    serverZone: process.env.AMPLITUDE_SERVER_ZONE?.toUpperCase() === 'EU' ? 'EU' : 'US',
  };
}
