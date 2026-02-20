import { NextResponse } from "next/server";
import { supabaseServer } from "../_lib/supabase";
import { requireSignedIn, requireEditor } from "../_lib/authz";

/**
 * /api/ops
 * GET: list ops (signed in)
 * POST: create op (editor)
 */
export async function GET() {
  const gate = await requireSignedIn();
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const sb = supabaseServer();
  const { data, error } = await sb
    .from("operations")
    .select("*")
    .order("start_at", { ascending: false });

  if (error) return NextResponse.json({ error: "DB error", details: error.message }, { status: 500 });
  return NextResponse.json({ operations: data ?? [] });
}

export async function POST(req: Request) {
  const gate = await requireEditor();
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const body = await req.json().catch(() => ({}));

  const title = String(body?.title ?? "").trim();
  const planet = String(body?.planet ?? "").trim();
  const start_at = String(body?.start_at ?? "").trim();
  const end_at = body?.end_at ? String(body.end_at).trim() : null;
  const units = Array.isArray(body?.units) ? body.units.map((x: any) => String(x)) : [];
  const outcome = String(body?.outcome ?? "Unklar");
  const summary = String(body?.summary ?? "");
  const participants = Array.isArray(body?.participants) ? body.participants : [];

  if (!title || !planet || !start_at) {
    return NextResponse.json({ error: "Missing fields (title, planet, start_at)" }, { status: 400 });
  }

  const created_by_discord_id = String((gate.session as any).discordId ?? "");

  const sb = supabaseServer();

  const { data: op, error: opErr } = await sb
    .from("operations")
    .insert({
      title,
      planet,
      start_at,
      end_at,
      units,
      outcome,
      summary,
      created_by_discord_id,
    })
    .select("*")
    .single();

  if (opErr) return NextResponse.json({ error: "DB insert failed", details: opErr.message }, { status: 500 });

  if (participants.length) {
    const rows = participants
      .map((p: any) => ({
        operation_id: op.id,
        marine_card_id: String(p?.marine_card_id ?? ""),
        role: p?.role ? String(p.role) : null,
        is_lead: !!p?.is_lead,
      }))
      .filter((r: any) => r.marine_card_id);

    if (rows.length) {
      const { error: partErr } = await sb.from("operation_participants").insert(rows);
      if (partErr) {
        await sb.from("operations").delete().eq("id", op.id);
        return NextResponse.json({ error: "DB participants insert failed", details: partErr.message }, { status: 500 });
      }
    }
  }

  return NextResponse.json({ ok: true, operation: op });
}
