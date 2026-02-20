import { createClient } from "@supabase/supabase-js";

/**
 * Server-only Supabase client (uses SERVICE ROLE key).
 * IMPORTANT: Never expose SUPABASE_SERVICE_ROLE_KEY to the browser.
 */
export function supabaseServer() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("Missing SUPABASE_URL");
  if (!serviceKey) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Helper: public URL for a file in a public bucket.
 */
export function publicUrl(bucket: string, path: string) {
  const url = process.env.SUPABASE_URL;
  if (!url) throw new Error("Missing SUPABASE_URL");
  return `${url.replace(/\/$/, "")}/storage/v1/object/public/${bucket}/${path}`;
}
