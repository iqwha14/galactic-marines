import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { requireEditor } from "@/lib/authz";

function normalizeDateTimeStrict(input: any): { ok: true; value: string } | { ok: false; error: string } {
  const s = String(input ?? "").trim();
  if (!s) return { ok: false, error: "empty" };

  // Already RFC3339/ISO-ish
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(s)) return { ok: true, value: s };

  // From <input type="datetime-local">: YYYY-MM-DDTHH:MM
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return { ok: true, value: d.toISOString() };
  }

  // Date-only
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(`${s}T00:00`);
    if (!Number.isNaN(d.getTime())) return { ok: true, value: d.toISOString() };
  }

  // Last resort: try Date parse
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return { ok: true, value: d.toISOString() };

  return { ok: false, error: `invalid datetime: ${s}` };
}

function normalizeOptionalDateTime(input: any): { ok: true; value: string | null } | { ok: false; error: string } {
  if (input == null) return { ok: true, value: null };
  const s = String(input).trim();
  if (!s) return { ok: true, value: null };
  const r = normalizeDateTimeStrict(s);
  if (!r.ok) return r;
  return { ok: true, value: r.value };
}

/**
 * /api/ops
 * GET: list ops (public)
 * POST: create op (editor)
 */
export async function GET() {
  const sb = supabaseServer();
  const { data, error } = await sb.from("operations").select("*").order("start_at", { ascending: false });

  if (error) return NextResponse.json({ error: "DB error", details: error.message }, { status: 500 });
  return NextResponse.json({ operations: data ?? [] });
}

export async function POST(req: Request) {
  const gate = await requireEditor(req);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const body = await req.json().catch(() => ({}));

  const title = String(body?.title ?? "").trim();
  const planet = String(body?.planet ?? "").trim();

  const startNorm = normalizeDateTimeStrict(body?.start_at);
  if (!startNorm.ok) {
    return NextResponse.json(
      { error: "Invalid start_at", details: startNorm.error, received: body?.start_at ?? null },
      { status: 400 }
    );
  }

  const endNorm = normalizeOptionalDateTime(body?.end_at);
  if (!endNorm.ok) {
    return NextResponse.json(
      { error: "Invalid end_at", details: endNorm.error, received: body?.end_at ?? null },
      { status: 400 }
    );
  }

  const units = Array.isArray(body?.units) ? body.units.map((x: any) => String(x)) : [];
  const outcome = String(body?.outcome ?? "Unklar");
  const summary = String(body?.summary ?? "");
  const participants = Array.isArray(body?.participants) ? body.participants : [];

  if (!title || !planet) {
    return NextResponse.json({ error: "Missing fields (title, planet)" }, { status: 400 });
  }

  const created_by_discord_id = String(gate.session?.discordId ?? "");

  const sb = supabaseServer();

  const { data: op, error: opErr } = await sb
    .from("operations")
    .insert({
      title,
      planet,
      start_at: startNorm.value,
      end_at: endNorm.value,
      units,
      outcome,
      summary,
      created_by_discord_id,
    })
    .select("*")
    .single();

  if (opErr) {
    return NextResponse.json(
      {
        error: "DB insert failed",
        details: opErr.message,
        code: (opErr as any).code,
        hint: (opErr as any).hint,
      },
      { status: 500 }
    );
  }

  if (participants.length) {
    const rows = participants
      .map((p: any) => ({
        operation_id: op.id,
        marine_card_id: String(p?.marine_card_id ?? "").trim(),
        role: p?.role ? String(p.role) : null,
        is_lead: !!p?.is_lead,
      }))
      .filter((r: any) => r.marine_card_id);

    if (rows.length) {
      const { error: partErr } = await sb.from("operation_participants").insert(rows);
      if (partErr) {
        await sb.from("operations").delete().eq("id", op.id);
        return NextResponse.json(
          {
            error: "DB participants insert failed",
            details: partErr.message,
            code: (partErr as any).code,
            hint: (partErr as any).hint,
          },
          { status: 500 }
        );
      }
    }
  }

  return NextResponse.json({ ok: true, operation: op });
}
