import * as amplitude from '@amplitude/analytics-browser';

type AmplitudePropertyValue = string | number | boolean | null | undefined;

export type AmplitudeEventProperties = Record<string, AmplitudePropertyValue>;
export type AmplitudeServerZone = 'US' | 'EU';

export interface AmplitudeConfig {
  apiKey: string | null;
  serverZone: AmplitudeServerZone;
}

export const DEFAULT_AMPLITUDE_CONFIG: AmplitudeConfig = {
  apiKey: null,
  serverZone: 'US',
};

let currentConfig = DEFAULT_AMPLITUDE_CONFIG;
let isInitialized = false;

export function configureAmplitude(config: AmplitudeConfig = DEFAULT_AMPLITUDE_CONFIG): void {
  const nextConfig = {
    apiKey: config.apiKey?.trim() || null,
    serverZone: config.serverZone,
  };
  if (
    currentConfig.apiKey === nextConfig.apiKey &&
    currentConfig.serverZone === nextConfig.serverZone
  ) {
    return;
  }

  currentConfig = nextConfig;
  isInitialized = false;
}

export function initAmplitude(): boolean {
  if (isInitialized) return true;
  if (!currentConfig.apiKey || typeof window === 'undefined') return false;

  amplitude.init(currentConfig.apiKey, {
    autocapture: {
      attribution: true,
      elementInteractions: false,
      fileDownloads: false,
      formInteractions: false,
      networkTracking: false,
      pageViews: true,
      sessions: true,
    },
    remoteConfig: {
      fetchRemoteConfig: false,
    },
    serverZone: currentConfig.serverZone,
  });
  isInitialized = true;
  return true;
}

export function trackAmplitudeEvent(
  eventName: string,
  properties?: AmplitudeEventProperties
): void {
  if (!initAmplitude()) return;
  amplitude.track(eventName, compactProperties(properties));
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
