import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-side Supabase helper.
 *
 * Required env vars:
 * - SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 *
 * IMPORTANT: Never expose the service role key to the client.
 */
function must(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

export function supabaseAdmin(): SupabaseClient {
  const url = must("SUPABASE_URL");
  const key = must("SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, {
    auth: { persistSession: false },
    global: { fetch },
  });
}

// Back-compat name used by some route files
export const supabaseServer = supabaseAdmin;

export function publicUrl(bucket: string, path: string): string {
  const url = must("SUPABASE_URL").replace(/\/$/, "");
  const cleanPath = String(path).replace(/^\//, "");
  return `${url}/storage/v1/object/public/${bucket}/${cleanPath}`;
}
