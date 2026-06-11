'use client';

import * as amplitude from '@amplitude/unified';

type AmplitudePropertyValue = string | number | boolean | null | undefined;

export type AmplitudeEventProperties = Record<string, AmplitudePropertyValue>;

const AMPLITUDE_API_KEY = '19445bfc8856391e9e23cfa3d76f7c60';
const AMPLITUDE_OPTIONS = {
  analytics: {
    autocapture: true,
  },
  sessionReplay: {
    sampleRate: 1,
  },
};

let initPromise: Promise<void> | null = null;
let hasInitializationFailed = false;

export function initAmplitude(): Promise<void> | null {
  if (typeof window === 'undefined') return null;

  if (!initPromise) {
    initPromise = amplitude.initAll(AMPLITUDE_API_KEY, AMPLITUDE_OPTIONS).catch(() => {
      hasInitializationFailed = true;
    });
  }

  return initPromise;
}

export function trackAmplitudeEvent(
  eventName: string,
  properties?: AmplitudeEventProperties
): void {
  const initialization = initAmplitude();
  if (!initialization) return;

  void initialization.then(() => {
    if (hasInitializationFailed) return;
    amplitude.track(eventName, compactProperties(properties));
  });
}

function compactProperties(
  properties: AmplitudeEventProperties | undefined
): Record<string, string | number | boolean | null> | undefined {
  if (!properties) return undefined;

  const compacted = Object.entries(properties).filter((entry): entry is [
    string,
    string | number | boolean | null,
  ] => entry[1] !== undefined);

  return compacted.length > 0 ? Object.fromEntries(compacted) : undefined;
}
