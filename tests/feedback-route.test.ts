import { afterEach, describe, expect, it, vi } from 'vitest';

const supabaseMock = vi.hoisted(() => ({
  insert: vi.fn(),
  from: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: supabaseMock.createClient,
}));

const { POST } = await import('../app/api/feedback/route');

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('POST /api/feedback', () => {
  it('validates and stores feedback reports in Supabase', async () => {
    vi.stubEnv('SUPABASE_URL', 'https://coupon-map.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key');
    supabaseMock.insert.mockResolvedValue({ error: null });
    supabaseMock.from.mockReturnValue({ insert: supabaseMock.insert });
    supabaseMock.createClient.mockReturnValue({ from: supabaseMock.from });

    const response = await POST(
      new Request('http://localhost/api/feedback', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'user-agent': 'vitest-browser',
        },
        body: JSON.stringify({
          type: 'coupon_incorrect',
          message: ' 쿠폰 조건이 실제 앱과 달라요. ',
          contact: 'hello@example.com',
          storeId: 'store-1',
          couponId: 'coupon-1',
          brandId: 'brand-1',
          brandName: '맥도날드',
          pagePath: '/?debug=1',
          searchRadiusMeters: 999.6,
        }),
      })
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(supabaseMock.createClient).toHaveBeenCalledWith(
      'https://coupon-map.supabase.co',
      'service-role-key',
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );
    expect(supabaseMock.from).toHaveBeenCalledWith('feedback_reports');
    expect(supabaseMock.insert).toHaveBeenCalledWith({
      type: 'coupon_incorrect',
      message: '쿠폰 조건이 실제 앱과 달라요.',
      contact: 'hello@example.com',
      store_id: 'store-1',
      coupon_id: 'coupon-1',
      brand_id: 'brand-1',
      brand_name: '맥도날드',
      page_path: '/?debug=1',
      search_radius_meters: 1000,
      user_agent: 'vitest-browser',
      source: 'coupon-map-web',
    });
  });

  it('rejects invalid feedback before opening a Supabase client', async () => {
    const response = await POST(
      new Request('http://localhost/api/feedback', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: 'coupon_incorrect',
          message: 'no',
        }),
      })
    );

    expect(response.status).toBe(400);
    expect(supabaseMock.createClient).not.toHaveBeenCalled();
  });

  it('reports missing server-side Supabase configuration', async () => {
    const response = await POST(
      new Request('http://localhost/api/feedback', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: 'feature_request',
          message: '필터 기능이 있으면 좋겠습니다.',
        }),
      })
    );

    expect(response.status).toBe(503);
    expect(supabaseMock.createClient).not.toHaveBeenCalled();
  });
});
