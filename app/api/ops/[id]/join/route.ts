import { NextResponse } from "next/server";
import { requireSignedIn } from "@/lib/authz";
import { supabaseServer } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/ops/:id/join
// Signed-in Discord user joins an operation as participant.
export async function POST(req: Request, ctx: { params: { id: string } }) {
  const gate = await requireSignedIn(req);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const operation_id = String(ctx.params.id ?? "").trim();
  if (!operation_id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const sb = supabaseServer();
  const discord_id = String(gate.session?.discordId ?? "").trim();

  const { data: member, error: memErr } = await sb
    .from("gm_unit_members")
    .select("discord_id, marine_card_id")
    .eq("discord_id", discord_id)
    .maybeSingle();
  if (memErr) return NextResponse.json({ error: "DB error", details: memErr.message }, { status: 500 });
  if (!member?.marine_card_id) {
    return NextResponse.json(
      { error: "Not in unit", details: "Du bist nicht als Mitglied der Einheit hinterlegt (Admin muss dich eintragen)." },
      { status: 403 }
    );
  }

  // Ensure op exists
  const { error: opErr } = await sb.from("operations").select("id").eq("id", operation_id).single();
  if (opErr) return NextResponse.json({ error: "Not found", details: opErr.message }, { status: 404 });

  const marine_card_id = String(member.marine_card_id);

  // Insert if not exists (PK on operation_id+marine_card_id)
  const { error: insErr } = await sb
    .from("operation_participants")
    .insert({ operation_id, marine_card_id, role: null, is_lead: false });

  if (insErr) {
    // If already exists, treat as ok
    const code = (insErr as any)?.code;
    if (code === "23505") return NextResponse.json({ ok: true, already: true });
    return NextResponse.json({ error: "Join failed", details: insErr.message, code }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
