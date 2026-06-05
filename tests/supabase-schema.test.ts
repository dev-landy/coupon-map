import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

describe('supabase schema', () => {
  it('does not hard-limit nearby store candidates before coupon filtering', () => {
    const schema = readFileSync('supabase/schema.sql', 'utf8');
    const nearbyStoresFunction = schema.match(
      /create or replace function public\.nearby_stores[\s\S]*?\$\$;/
    )?.[0];

    expect(nearbyStoresFunction).toBeDefined();
    expect(nearbyStoresFunction).not.toMatch(/\blimit\b/i);
  });
});
