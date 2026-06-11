import { afterEach, describe, expect, it, vi } from 'vitest';

const amplitudeMock = vi.hoisted(() => ({
  initAll: vi.fn(() => Promise.resolve()),
  track: vi.fn(),
}));

vi.mock('@amplitude/unified', () => amplitudeMock);

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe('Amplitude browser tracking', () => {
  it('initializes Analytics and Session Replay once with the documented config', async () => {
    const { initAmplitude } = await import('../lib/amplitude');

    const firstInitialization = initAmplitude();
    const secondInitialization = initAmplitude();

    expect(secondInitialization).toBe(firstInitialization);
    await firstInitialization;

    expect(amplitudeMock.initAll).toHaveBeenCalledTimes(1);
    expect(amplitudeMock.initAll).toHaveBeenCalledWith(
      '19445bfc8856391e9e23cfa3d76f7c60',
      {
        analytics: {
          autocapture: true,
        },
        sessionReplay: {
          sampleRate: 1,
        },
      }
    );
  });

  it('tracks events after the single browser initialization completes', async () => {
    const { trackAmplitudeEvent } = await import('../lib/amplitude');

    trackAmplitudeEvent('coupon_map_viewed', {
      omitted_property: undefined,
      store_count: 2,
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(amplitudeMock.initAll).toHaveBeenCalledTimes(1);
    expect(amplitudeMock.track).toHaveBeenCalledWith('coupon_map_viewed', {
      store_count: 2,
    });
  });
});
