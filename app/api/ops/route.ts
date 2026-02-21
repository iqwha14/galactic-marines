import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { requireEditor } from "@/lib/authz";

function normalizeDateTime(value: unknown, field: string): string {
  const raw = String(value ?? "").trim();
  if (!raw) throw new Error(`Missing ${field}`);

  // Accept RFC3339/ISO or datetime-local (YYYY-MM-DDTHH:mm)
  const m = raw.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  const candidate = m ? `${raw}:00` : raw;
  const d = new Date(candidate);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid ${field}: ${raw}`);
  return d.toISOString();
}

function normalizeOptionalDateTime(value: unknown, field: string): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  return normalizeDateTime(raw, field);
}

/**
 * /api/ops
 * GET: list ops (public)
 * POST: create op (editor)
 */
export async function GET() {
  const sb = supabaseServer();
  const { data, error } = await sb
    .from("operations")
    .select("*")
    .order("start_at", { ascending: false });

  if (error) return NextResponse.json({ error: "DB error", details: error.message }, { status: 500 });
  return NextResponse.json({ operations: data ?? [] });
}

export async function POST(req: Request) {
  const gate = await requireEditor(req);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const body = await req.json().catch(() => ({}));

  const title = String(body?.title ?? "").trim();
  const planet = String(body?.planet ?? "").trim();
  let start_at = "";
  let end_at: string | null = null;
  const units = Array.isArray(body?.units) ? body.units.map((x: any) => String(x)) : [];
  const outcome = String(body?.outcome ?? "Unklar");
  const summary = String(body?.summary ?? "");
  const participants = Array.isArray(body?.participants) ? body.participants : [];

  if (!title || !planet) return NextResponse.json({ error: "Missing fields (title, planet)" }, { status: 400 });

  try {
    start_at = normalizeDateTime(body?.start_at, "start_at");
    end_at = normalizeOptionalDateTime(body?.end_at, "end_at");
  } catch (e: any) {
    return NextResponse.json({ error: "Invalid datetime", details: String(e?.message ?? e) }, { status: 400 });
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

  if (opErr)
    return NextResponse.json(
      { error: "DB insert failed", details: opErr.message, hint: (opErr as any).hint, code: (opErr as any).code },
      { status: 500 }
    );

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
        return NextResponse.json(
          { error: "DB participants insert failed", details: partErr.message, hint: (partErr as any).hint, code: (partErr as any).code },
          { status: 500 }
        );
      }
    }
  }

  return NextResponse.json({ ok: true, operation: op });
}
