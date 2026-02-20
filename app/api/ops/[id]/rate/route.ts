import { NextResponse } from "next/server";
import { supabaseServer } from "../../../_lib/supabase";
import { requireSignedIn } from "../../../_lib/authz";

export async function POST(req: Request, ctx: { params: { id: string } }) {
  const gate = await requireSignedIn();
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const id = String(ctx.params.id ?? "");
  const body = await req.json().catch(() => ({}));
  const stars = Number(body?.stars ?? 0);
  const comment = body?.comment ? String(body.comment).slice(0, 2000) : null;

  if (!(stars >= 1 && stars <= 5)) return NextResponse.json({ error: "stars must be 1..5" }, { status: 400 });

  const discord_id = String((gate.session as any).discordId ?? "");
  const sb = supabaseServer();

  const { error } = await sb.from("operation_ratings").upsert(
    { operation_id: id, discord_id, stars, comment },
    { onConflict: "operation_id,discord_id" }
  );

  if (error) return NextResponse.json({ error: "DB error", details: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
