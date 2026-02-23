import { supabaseAdmin as _supabaseAdmin, supabaseServer as _supabaseServer } from "./supabase";

/**
 * Backwards-compatible re-export.
 *
 * Some route files import from "@/lib/supabaseAdmin".
 * The actual implementation lives in "@/lib/supabase".
 */
export function supabaseAdmin() {
  return _supabaseAdmin();
}

export function supabaseServer() {
  return _supabaseServer();
}
