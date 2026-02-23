import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { requireSignedIn } from "@/lib/authz";

// POST /api/ops/:id/rate-marine (signed in)
// body: { marine_card_id: string, stars: number, comment: string }
export async function POST(req: Request, ctx: { params: { id: string } }) {
  const gate = await requireSignedIn(req);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const operation_id = String(ctx.params.id ?? "");
  const body = await req.json().catch(() => ({}));
  const marine_card_id = String(body?.marine_card_id ?? "").trim();
  const stars = Math.max(1, Math.min(5, Number(body?.stars ?? 0)));
  const comment = String(body?.comment ?? "").trim().slice(0, 2000);

  if (!operation_id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  if (!marine_card_id) return NextResponse.json({ error: "Missing marine_card_id" }, { status: 400 });
  if (!stars || Number.isNaN(stars)) return NextResponse.json({ error: "Invalid stars" }, { status: 400 });
  if (!comment) return NextResponse.json({ error: "Missing comment", details: "Bitte gib einen Grund an." }, { status: 400 });

  const sb = supabaseServer();
  const discord_id = String(gate.session?.discordId ?? "");

  // Allow the creator to rate even if gm_unit_members mapping isn't set yet.
  const { data: op, error: opErr } = await sb
    .from("operations")
    .select("id,created_by_discord_id")
    .eq("id", operation_id)
    .maybeSingle();
  if (opErr) return NextResponse.json({ error: "DB error", details: opErr.message }, { status: 500 });
  const isCreator = !!op && String((op as any).created_by_discord_id ?? "").trim() === discord_id;

  // Participation gate: only participants can rate, and only participants can be rated.
  const { data: member, error: memErr } = await sb
    .from("gm_unit_members")
    .select("marine_card_id")
    .eq("discord_id", discord_id)
    .maybeSingle();
  if (memErr) return NextResponse.json({ error: "DB error", details: memErr.message }, { status: 500 });
  const myCard = String(member?.marine_card_id ?? "").trim();
  if (!myCard && !isCreator) {
    return NextResponse.json(
      { error: "Not in unit", details: "Du bist nicht als Mitglied der Einheit hinterlegt (Admin muss dich eintragen)." },
      { status: 403 }
    );
  }

  const [{ data: iAmInOp, error: partErr }, { data: targetInOp, error: targErr }] = await Promise.all([
    isCreator
      ? Promise.resolve({ data: { operation_id }, error: null } as any)
      : sb
          .from("operation_participants")
          .select("operation_id")
          .eq("operation_id", operation_id)
          .eq("marine_card_id", myCard)
          .maybeSingle(),
    sb
      .from("operation_participants")
      .select("operation_id")
      .eq("operation_id", operation_id)
      .eq("marine_card_id", marine_card_id)
      .maybeSingle(),
  ]);
  if (partErr) return NextResponse.json({ error: "DB error", details: partErr.message }, { status: 500 });
  if (targErr) return NextResponse.json({ error: "DB error", details: targErr.message }, { status: 500 });
  if (!iAmInOp) return NextResponse.json({ error: "Not a participant", details: "Nur Teilnehmer können bewerten." }, { status: 403 });
  if (!targetInOp)
    return NextResponse.json({ error: "Invalid target", details: "Du kannst nur Soldaten bewerten, die am Einsatz teilgenommen haben." }, { status: 400 });

  const { error: delErr } = await sb
    .from("marine_ratings")
    .delete()
    .eq("operation_id", operation_id)
    .eq("discord_id", discord_id)
    .eq("marine_card_id", marine_card_id);
  if (delErr) return NextResponse.json({ error: "DB error", details: delErr.message }, { status: 500 });

  const { error: insErr } = await sb.from("marine_ratings").insert({ operation_id, discord_id, marine_card_id, stars, comment });
  if (insErr) return NextResponse.json({ error: "DB error", details: insErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
