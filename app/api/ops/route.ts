import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { requireEditor } from "@/lib/authz";

type DtParse = { ok: true; iso: string } | { ok: false; received: string; reason: string };

/**
 * Supabase/Postgres expects timestamptz as RFC3339/ISO.
 * We accept common inputs and ALWAYS convert to a valid ISO string, otherwise return a 400 with details.
 */
function parseDateTime(input: any): DtParse {
  const s = String(input ?? "").trim();
  if (!s) return { ok: false, received: s, reason: "empty" };

  // RFC3339 with seconds + timezone
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(s)) {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return { ok: true, iso: d.toISOString() };
    return { ok: false, received: s, reason: "invalid RFC3339 date" };
  }

  // From <input type="datetime-local">: YYYY-MM-DDTHH:MM
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return { ok: true, iso: d.toISOString() };
    return { ok: false, received: s, reason: "invalid datetime-local" };
  }

  // Date-only
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(`${s}T00:00`);
    if (!Number.isNaN(d.getTime())) return { ok: true, iso: d.toISOString() };
    return { ok: false, received: s, reason: "invalid date-only" };
  }

  // Last resort
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return { ok: true, iso: d.toISOString() };
  return { ok: false, received: s, reason: "unparseable" };
}

function postgrestErrPayload(err: any) {
  return {
    message: err?.message,
    details: err?.details,
    hint: err?.hint,
    code: err?.code,
  };
}

/**
 * /api/ops
 * GET: list ops (public)
 * POST: create op (editor)
 */
export async function GET() {
  const sb = supabaseServer();
  const { data, error } = await sb.from("operations").select("*").order("start_at", { ascending: false });

  if (error) return NextResponse.json({ error: "DB error", ...postgrestErrPayload(error) }, { status: 500 });
  return NextResponse.json({ operations: data ?? [] });
}

export async function POST(req: Request) {
  const gate = await requireEditor(req);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const body = await req.json().catch(() => ({}));

  const title = String(body?.title ?? "").trim();
  const planet = String(body?.planet ?? "").trim();

  const startParsed = parseDateTime(body?.start_at);
  const endParsed = body?.end_at ? parseDateTime(body?.end_at) : null;

  const units = Array.isArray(body?.units) ? body.units.map((x: any) => String(x)) : [];
  const outcome = String(body?.outcome ?? "Unklar");
  const summary = String(body?.summary ?? "");
  const participants = Array.isArray(body?.participants) ? body.participants : [];

  if (!title || !planet) {
    return NextResponse.json({ error: "Missing fields (title, planet)" }, { status: 400 });
  }
  if (!startParsed.ok) {
    return NextResponse.json({ error: "Invalid start_at", reason: startParsed.reason, received: startParsed.received }, { status: 400 });
  }
  if (endParsed && !endParsed.ok) {
    return NextResponse.json({ error: "Invalid end_at", reason: endParsed.reason, received: endParsed.received }, { status: 400 });
  }

  const created_by_discord_id = String(gate.session?.discordId ?? "");

  const sb = supabaseServer();

  const { data: op, error: opErr } = await sb
    .from("operations")
    .insert({
      title,
      planet,
      start_at: startParsed.iso,
      end_at: endParsed ? (endParsed as any).iso : null,
      units,
      outcome,
      summary,
      created_by_discord_id,
    })
    .select("*")
    .single();

  if (opErr) return NextResponse.json({ error: "DB insert failed", ...postgrestErrPayload(opErr) }, { status: 500 });

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
        return NextResponse.json({ error: "DB participants insert failed", ...postgrestErrPayload(partErr) }, { status: 500 });
      }
    }
  }

  return NextResponse.json({ ok: true, operation: op });
}
