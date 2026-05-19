import { createClient } from '@supabase/supabase-js';

let _client = null;

/**
 * Returns a lazily-initialized Supabase client using the service role key.
 * The service role key bypasses RLS — use only in server-side code.
 * Throws on first call if SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY are missing.
 */
export function getSupabaseClient() {
  if (_client) return _client;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set to use the Supabase client.');
  }

  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  return _client;
}

/**
 * Default organization ID for single-org mode (phases 4-8).
 * Set SUPABASE_DEFAULT_ORG_ID in .env; falls back to the seed value.
 */
export function getDefaultOrgId() {
  return process.env.SUPABASE_DEFAULT_ORG_ID || '00000000-0000-0000-0000-000000000001';
}
