import { NextResponse } from "next/server";
import { requireEditor } from "@/lib/authz";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Optional table:
 * gm_audit(id bigserial pk, created_at timestamptz default now(), actor_discord_id text, action text, meta jsonb)
 */
export async function GET() {
  const gate = await requireEditor();
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  try {
    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from("gm_audit")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      return NextResponse.json(
        { ok: true, rows: [], warning: "Tabelle gm_audit nicht vorhanden oder keine Rechte. (Optionales Feature)" },
        { status: 200 }
      );
    }
    return NextResponse.json({ ok: true, rows: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ error: "Server error", details: e?.message ?? String(e) }, { status: 500 });
  }
}
