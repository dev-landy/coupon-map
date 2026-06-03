import { describe, expect, it } from 'vitest';

import { dynamic } from '../app/page';

describe('HomePage route config', () => {
  it('renders dynamically so Supabase data and coupon dates are request-time values', () => {
    expect(dynamic).toBe('force-dynamic');
  });
});
