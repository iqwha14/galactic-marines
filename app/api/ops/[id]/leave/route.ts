import { NextResponse } from "next/server";
import { requireSignedIn } from "@/lib/authz";
import { supabaseServer } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/ops/:id/leave
// Signed-in Discord user leaves an operation (removes own participant row).
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

  // Ensure op exists + not over (keep historical participants after end)
  const { data: op, error: opErr } = await sb
    .from("operations")
    .select("id,end_at")
    .eq("id", operation_id)
    .single();
  if (opErr || !op?.id) return NextResponse.json({ error: "Not found", details: opErr?.message ?? "Not found" }, { status: 404 });

  const endAt = op.end_at ? new Date(String(op.end_at)) : null;
  if (endAt && !Number.isNaN(endAt.getTime()) && Date.now() >= endAt.getTime()) {
    return NextResponse.json({ error: "Operation ended", details: "Der Einsatz ist bereits vorbei. Verlassen nicht möglich." }, { status: 409 });
  }

  const marine_card_id = String(member.marine_card_id);

  const { error: delErr } = await sb
    .from("operation_participants")
    .delete()
    .eq("operation_id", operation_id)
    .eq("marine_card_id", marine_card_id);

  if (delErr) return NextResponse.json({ error: "Leave failed", details: delErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
