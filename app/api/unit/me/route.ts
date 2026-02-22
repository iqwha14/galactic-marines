import { NextResponse } from "next/server";
import { requireSignedIn } from "@/lib/authz";
import { supabaseServer } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/unit/me
// Returns unit membership mapping for the signed-in Discord user.
export async function GET(req: Request) {
  const gate = await requireSignedIn(req);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const discord_id = String(gate.session?.discordId ?? "").trim();
  const sb = supabaseServer();

  const { data, error } = await sb
    .from("gm_unit_members")
    .select("discord_id, marine_card_id, display_name, updated_at")
    .eq("discord_id", discord_id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: "DB error", details: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ ok: true, member: null });

  return NextResponse.json({ ok: true, member: data });
}
