import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Browser-side Supabase client.
 *
 * Reads public env vars (safe to expose to the client — the anon key is
 * gated by Row Level Security on the database). Both vars are required;
 * we fail fast at startup rather than letting a vague runtime error surface.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function assertEnv(value: string | undefined, name: string): string {
  if (!value || value.trim().length === 0) {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
        'Copy .env.local.example to .env.local and fill in the values.'
    );
  }
  return value;
}

export const supabase: SupabaseClient = createClient(
  assertEnv(SUPABASE_URL, 'NEXT_PUBLIC_SUPABASE_URL'),
  assertEnv(SUPABASE_ANON_KEY, 'NEXT_PUBLIC_SUPABASE_ANON_KEY')
);
