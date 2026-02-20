import { createClient } from "@supabase/supabase-js";

/**
 * DROP-IN helper for your existing API routes that import:
 *   ../../../../_lib/supabase
 *
 * This file is safe to BUILD even if env vars are missing.
 * (At runtime you still need the real env vars on Vercel.)
 *
 * Required on Vercel:
 * - SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 */

const SUPABASE_URL = process.env.SUPABASE_URL ?? "http://localhost:54321";
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "dev-dummy-service-role-key";

// Server-side admin client (Service Role)
export const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});
