import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/api/_lib/supabase";
import { requireSignedIn } from "@/app/api/_lib/authz";

export async function POST(req: Request, ctx: { params: { id: string } }) {
  const gate = await requireSignedIn(req);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const opId = String(ctx?.params?.id ?? "");
  const body = await req.json().catch(() => ({}));
  const stars = Number(body?.stars ?? 0);

  if (!opId) return NextResponse.json({ error: "Missing op id" }, { status: 400 });
  if (!Number.isFinite(stars) || stars < 1 || stars > 5) {
    return NextResponse.json({ error: "stars must be 1..5" }, { status: 400 });
  }

  const sb = supabaseAdmin();
  const { error } = await sb
    .from("op_ratings")
    .upsert(
      {
        op_id: opId,
        discord_id: gate.discordId,
        stars,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "op_id,discord_id" }
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
