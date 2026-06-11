import { afterEach, describe, expect, it, vi } from 'vitest';

const { GET } = await import('../app/api/amplitude-config/route');

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('GET /api/amplitude-config', () => {
  it('returns runtime Amplitude config without caching the response', async () => {
    vi.stubEnv('AMPLITUDE_API_KEY', 'test-amplitude-key');
    vi.stubEnv('AMPLITUDE_SERVER_ZONE', 'EU');

    const response = GET();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store, max-age=0');
    await expect(response.json()).resolves.toEqual({
      apiKey: 'test-amplitude-key',
      serverZone: 'EU',
    });
  });

  it('keeps analytics disabled when the API key is missing', async () => {
    const response = GET();

    await expect(response.json()).resolves.toEqual({
      apiKey: null,
      serverZone: 'US',
    });
  });
});
