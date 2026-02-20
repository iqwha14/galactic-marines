import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { requireSignedIn } from "@/lib/authz";

export async function POST(req: Request, ctx: { params: { id: string } }) {
  const user = await requireSignedIn(req as any);
  const id = String(ctx.params.id ?? "");
  const body = await req.json().catch(() => ({}));
  const marine_card_id = String(body?.marine_card_id ?? "");
  const stars = Number(body?.stars ?? 0);
  const comment = body?.comment ? String(body.comment).slice(0, 2000) : null;

  if (!marine_card_id) return NextResponse.json({ error: "marine_card_id missing" }, { status: 400 });
  if (!(stars >= 1 && stars <= 5)) return NextResponse.json({ error: "stars must be 1..5" }, { status: 400 });

  const discord_id = String((gate.session as any).discordId ?? "");
  const sb = supabaseServer();

  const { error } = await sb.from("marine_ratings").upsert(
    { operation_id: id, marine_card_id, discord_id, stars, comment },
    { onConflict: "operation_id,marine_card_id,discord_id" }
  );

  if (error) return NextResponse.json({ error: "DB error", details: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
