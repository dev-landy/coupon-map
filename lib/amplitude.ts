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

interface QueuedAmplitudeEvent {
  eventName: string;
  properties?: AmplitudeEventProperties;
}

const AMPLITUDE_CONFIG_ENDPOINT = '/api/amplitude-config';
const MAX_QUEUED_EVENTS = 20;

let currentConfig = DEFAULT_AMPLITUDE_CONFIG;
let isInitialized = false;
let configRequest: Promise<AmplitudeConfig> | null = null;
let queuedEvents: QueuedAmplitudeEvent[] = [];

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
  if (initAmplitude()) {
    amplitude.track(eventName, compactProperties(properties));
    return;
  }

  if (typeof window === 'undefined') return;
  queueAmplitudeEvent(eventName, properties);
  void loadAmplitudeConfig().then((config) => {
    configureAmplitude(config);
    if (!initAmplitude()) {
      queuedEvents = [];
      return;
    }
    flushQueuedEvents();
  });
}

async function loadAmplitudeConfig(): Promise<AmplitudeConfig> {
  if (configRequest) return configRequest;

  configRequest = fetch(AMPLITUDE_CONFIG_ENDPOINT, {
    cache: 'no-store',
    credentials: 'same-origin',
  })
    .then(async (response) => {
      if (!response.ok) return DEFAULT_AMPLITUDE_CONFIG;
      return parseAmplitudeConfig(await response.json().catch(() => null));
    })
    .catch(() => DEFAULT_AMPLITUDE_CONFIG);

  return configRequest;
}

function queueAmplitudeEvent(
  eventName: string,
  properties: AmplitudeEventProperties | undefined
): void {
  queuedEvents.push({ eventName, properties });
  if (queuedEvents.length > MAX_QUEUED_EVENTS) {
    queuedEvents = queuedEvents.slice(-MAX_QUEUED_EVENTS);
  }
}

function flushQueuedEvents(): void {
  const events = queuedEvents;
  queuedEvents = [];
  for (const event of events) {
    amplitude.track(event.eventName, compactProperties(event.properties));
  }
}

function parseAmplitudeConfig(value: unknown): AmplitudeConfig {
  if (!value || typeof value !== 'object') return DEFAULT_AMPLITUDE_CONFIG;
  const config = value as Partial<AmplitudeConfig>;

  return {
    apiKey: typeof config.apiKey === 'string' && config.apiKey.trim() ? config.apiKey : null,
    serverZone: config.serverZone === 'EU' ? 'EU' : 'US',
  };
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
