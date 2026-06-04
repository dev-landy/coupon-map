import { describe, expect, it } from 'vitest';

import { revalidate } from '../app/page';

describe('HomePage route config', () => {
  it('uses ISR so the homepage can be cached instead of server-rendered on every request', () => {
    expect(revalidate).toBe(300);
  });
});
