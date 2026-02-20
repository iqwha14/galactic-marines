import { createClient } from "@supabase/supabase-js";

/**
 * This file exists ONLY to satisfy imports like:
 *   import { supabaseAdmin } from "../../../../_lib/supabase";
 * from files under app/api/.../route.ts
 *
 * Vercel env vars required at runtime:
 * - SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 */
export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  { auth: { persistSession: false } }
);
