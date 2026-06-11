import { afterEach, describe, expect, it, vi } from 'vitest';

const amplitudeMock = vi.hoisted(() => ({
  init: vi.fn(),
  track: vi.fn(),
}));

vi.mock('@amplitude/analytics-browser', () => amplitudeMock);

afterEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('Amplitude browser tracking', () => {
  it('loads runtime config and flushes the first queued event', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            apiKey: 'test-amplitude-key',
            serverZone: 'EU',
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }
        )
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    const { trackAmplitudeEvent } = await import('../lib/amplitude');

    trackAmplitudeEvent('coupon_map_viewed', {
      store_count: 2,
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fetchMock).toHaveBeenCalledWith('/api/amplitude-config', {
      cache: 'no-store',
      credentials: 'same-origin',
    });
    expect(amplitudeMock.init).toHaveBeenCalledWith(
      'test-amplitude-key',
      expect.objectContaining({
        serverZone: 'EU',
      })
    );
    expect(amplitudeMock.track).toHaveBeenCalledWith('coupon_map_viewed', {
      store_count: 2,
    });
  });
});
