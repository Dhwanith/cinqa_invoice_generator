import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;
let _initPromise: Promise<SupabaseClient> | null = null;

/**
 * Returns the lazily-initialised Supabase client.
 * On first call, fetches /api/config to get the project URL and anon key
 * so no build-time VITE_* env vars are required — the key comes from the server.
 */
export async function getSupabase(): Promise<SupabaseClient> {
  if (_client) return _client;
  if (_initPromise) return _initPromise;

  _initPromise = fetch("/api/config", { cache: "no-store" })
    .then((res) => {
      if (!res.ok) throw new Error("Failed to fetch Supabase config from server.");
      return res.json();
    })
    .then(({ supabaseUrl, supabaseAnonKey }: { supabaseUrl: string; supabaseAnonKey: string }) => {
      if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error("SUPABASE_URL or SUPABASE_ANON_KEY is not configured on the server.");
      }
      _client = createClient(supabaseUrl, supabaseAnonKey, {
        auth: { persistSession: true, autoRefreshToken: true },
      });
      return _client;
    });

  return _initPromise;
}
