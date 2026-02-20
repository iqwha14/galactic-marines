import { NextResponse } from "next/server";
import { requireSignedIn } from "@/app/api/_lib/authz";
import { supabaseAdmin } from "@/app/api/_lib/supabase";

export async function POST(req: Request, ctx: { params: { id: string } }) {
  // 1) Auth (throws if not signed in)
  const user = await requireSignedIn(req as any);

  // 2) params + body
  const op_id = String(ctx.params.id ?? "");
  const body = await req.json().catch(() => ({}));

  const marine_id = String(body.marine_id ?? "");
  const stars = Number(body.stars ?? 0);

  if (!op_id || !marine_id) {
    return NextResponse.json({ error: "Missing op_id or marine_id" }, { status: 400 });
  }
  if (!(stars >= 1 && stars <= 5)) {
    return NextResponse.json({ error: "Stars must be 1..5" }, { status: 400 });
  }

  // 3) DB
  const sb = supabaseAdmin();
  const { error } = await sb
    .from("marine_ratings")
    .upsert(
      {
        op_id,
        marine_id,
        stars,
        rated_by_discord_id: user.discordId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "op_id,marine_id,rated_by_discord_id" }
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}