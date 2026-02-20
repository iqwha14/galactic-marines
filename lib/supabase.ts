import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Minimal helper layer used by the Ops feature routes.
//
// Required env vars (set in Vercel):
// - SUPABASE_URL
// - SUPABASE_ANON_KEY
// - SUPABASE_SERVICE_ROLE_KEY

function mustEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} missing on server`);
  return v;
}

export function supabaseServer(): SupabaseClient {
  return createClient(mustEnv("SUPABASE_URL"), mustEnv("SUPABASE_ANON_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function supabaseAdmin(): SupabaseClient {
  return createClient(mustEnv("SUPABASE_URL"), mustEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Build a public URL for a file in a public bucket.
 * Works even if you don't want to call storage.getPublicUrl().
 */
export function publicUrl(bucket: string, path: string): string {
  const base = mustEnv("SUPABASE_URL").replace(/\/$/, "");
  const cleanBucket = bucket.replace(/^\/+|\/+$/g, "");
  const cleanPath = path.replace(/^\/+/, "");
  return `${base}/storage/v1/object/public/${encodeURIComponent(cleanBucket)}/${cleanPath
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
}
