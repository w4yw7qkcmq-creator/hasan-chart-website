import { createClient } from "@supabase/supabase-js";

export function getPublicSupabaseClient() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.STAGING_SUPABASE_URL || process.env.SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.STAGING_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY;

  if (!url || !key) return null;

  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
