import { NextResponse } from 'next/server';

import type { AmplitudeConfig } from '../../../lib/amplitude';

export const dynamic = 'force-dynamic';

export function GET() {
  const config: AmplitudeConfig = {
    apiKey: process.env.AMPLITUDE_API_KEY?.trim() || null,
    serverZone: process.env.AMPLITUDE_SERVER_ZONE?.toUpperCase() === 'EU' ? 'EU' : 'US',
  };

  return NextResponse.json(config, {
    headers: {
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}
