import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

describe('supabase schema', () => {
  it('keeps the iPhone store fallback column idempotently repairable', () => {
    const schema = readFileSync('supabase/schema.sql', 'utf8');
    const publicReadGrants = readFileSync('supabase/public-read-grants.sql', 'utf8');

    expect(schema).toMatch(/alter table brands add column if not exists iphone_store_url text;/);
    expect(publicReadGrants).toMatch(
      /alter table public\.brands add column if not exists iphone_store_url text;/
    );
  });

  it('does not hard-limit nearby store candidates before coupon filtering', () => {
    const schema = readFileSync('supabase/schema.sql', 'utf8');
    const nearbyStoresFunction = schema.match(
      /create or replace function public\.nearby_stores[\s\S]*?\$\$;/
    )?.[0];

    expect(nearbyStoresFunction).toBeDefined();
    expect(nearbyStoresFunction).not.toMatch(/\blimit\b/i);
  });
});
