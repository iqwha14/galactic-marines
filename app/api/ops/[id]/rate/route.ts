import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { requireSignedIn } from "@/lib/authz";

// POST /api/ops/:id/rate (signed in)
// body: { stars: number, comment?: string }
export async function POST(req: Request, ctx: { params: { id: string } }) {
  const gate = await requireSignedIn(req);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const id = String(ctx.params.id ?? "");
  const body = await req.json().catch(() => ({}));
  const stars = Math.max(1, Math.min(5, Number(body?.stars ?? 0)));
  const comment = String(body?.comment ?? "").slice(0, 2000);

  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  if (!stars || Number.isNaN(stars)) return NextResponse.json({ error: "Invalid stars" }, { status: 400 });

  const sb = supabaseServer();
  const discord_id = String(gate.session?.discordId ?? "");

  // Participation gate: only members who joined this operation may rate it.
  const { data: member, error: memErr } = await sb
    .from("gm_unit_members")
    .select("marine_card_id")
    .eq("discord_id", discord_id)
    .maybeSingle();
  if (memErr) return NextResponse.json({ error: "DB error", details: memErr.message }, { status: 500 });
  const myCard = String(member?.marine_card_id ?? "").trim();
  if (!myCard) {
    return NextResponse.json(
      { error: "Not in unit", details: "Du bist nicht als Mitglied der Einheit hinterlegt (Admin muss dich eintragen)." },
      { status: 403 }
    );
  }
  const { data: part, error: partErr } = await sb
    .from("operation_participants")
    .select("operation_id")
    .eq("operation_id", id)
    .eq("marine_card_id", myCard)
    .maybeSingle();
  if (partErr) return NextResponse.json({ error: "DB error", details: partErr.message }, { status: 500 });
  if (!part) return NextResponse.json({ error: "Not a participant", details: "Nur Teilnehmer können bewerten." }, { status: 403 });

  // upsert by (operation_id, discord_id) if unique exists; otherwise emulate with delete+insert
  const { error: delErr } = await sb.from("operation_ratings").delete().eq("operation_id", id).eq("discord_id", discord_id);
  if (delErr) return NextResponse.json({ error: "DB error", details: delErr.message }, { status: 500 });

  const { error: insErr } = await sb.from("operation_ratings").insert({ operation_id: id, discord_id, stars, comment });
  if (insErr) return NextResponse.json({ error: "DB error", details: insErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
