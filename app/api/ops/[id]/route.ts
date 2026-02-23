import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { requireEditor } from "@/lib/authz";

function normalizeDateTime(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) throw new Error("empty");
  const m = raw.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  const candidate = m ? `${raw}:00` : raw;
  const d = new Date(candidate);
  if (Number.isNaN(d.getTime())) throw new Error(`invalid: ${raw}`);
  return d.toISOString();
}

/**
 * /api/ops/:id
 * GET: op + participants + ratings + reports (public)
 * PUT: update op + replace participants (editor)
 * DELETE: delete op (editor)
 */

export async function GET(_: Request, ctx: { params: { id: string } }) {
  const id = String(ctx.params.id ?? "");
  const sb = supabaseServer();

  const { data: op, error: opErr } = await sb.from("operations").select("*").eq("id", id).single();
  if (opErr) return NextResponse.json({ error: "Not found", details: opErr.message }, { status: 404 });

  const [{ data: participants }, { data: ratings }, { data: marineRatings }, { data: reports }] = await Promise.all([
    sb.from("operation_participants").select("*").eq("operation_id", id),
    sb.from("operation_ratings").select("*").eq("operation_id", id),
    sb.from("marine_ratings").select("*").eq("operation_id", id),
    sb.from("operation_reports").select("*").eq("operation_id", id).order("created_at", { ascending: false }),
  ]);

  // Killlogs are optional (table might not exist yet in some installs)
  let killlogs: any[] = [];
  try {
    const { data } = await sb
      .from("operation_killlogs")
      .select("*")
      .eq("operation_id", id)
      .order("created_at", { ascending: false });
    killlogs = data ?? [];
  } catch {
    killlogs = [];
  }

  return NextResponse.json({
    operation: op,
    participants: participants ?? [],
    ratings: ratings ?? [],
    marineRatings: marineRatings ?? [],
    reports: reports ?? [],
    killlogs,
  });
}

export async function PUT(req: Request, ctx: { params: { id: string } }) {
  const gate = await requireEditor(req);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const id = String(ctx.params.id ?? "");
  const body = await req.json().catch(() => ({}));

  const patch: any = {};
  const allow = ["title", "planet", "start_at", "end_at", "units", "outcome", "summary", "image_url", "status", "map_grid"];
  for (const k of allow) {
    if (!(k in body)) continue;
    // Normalize datetimes if needed (supports datetime-local)
    if (k === "start_at") {
      try {
        patch.start_at = normalizeDateTime(body.start_at);
      } catch (e: any) {
        return NextResponse.json({ error: "Invalid datetime", details: `start_at ${String(e?.message ?? e)}` }, { status: 400 });
      }
      continue;
    }
    if (k === "end_at") {
      const raw = String(body.end_at ?? "").trim();
      if (!raw) patch.end_at = null;
      else {
        try {
          patch.end_at = normalizeDateTime(raw);
        } catch (e: any) {
          return NextResponse.json({ error: "Invalid datetime", details: `end_at ${String(e?.message ?? e)}` }, { status: 400 });
        }
      }
      continue;
    }
    patch[k] = body[k];
  }

  const participants = Array.isArray(body?.participants) ? body.participants : null;

  const sb = supabaseServer();

  const { data: op, error: upErr } = await sb.from("operations").update(patch).eq("id", id).select("*").single();
  if (upErr)
    return NextResponse.json(
      { error: "Update failed", details: upErr.message, hint: (upErr as any).hint, code: (upErr as any).code },
      { status: 500 }
    );

  if (participants) {
    await sb.from("operation_participants").delete().eq("operation_id", id);

    const rows = participants
      .map((p: any) => ({
        operation_id: id,
        marine_card_id: String(p?.marine_card_id ?? ""),
        role: p?.role ? String(p.role) : null,
        is_lead: !!p?.is_lead,
      }))
      .filter((r: any) => r.marine_card_id);

    if (rows.length) {
      const { error: partErr } = await sb.from("operation_participants").insert(rows);
      if (partErr)
        return NextResponse.json(
          { error: "Participants update failed", details: partErr.message, hint: (partErr as any).hint, code: (partErr as any).code },
          { status: 500 }
        );
    }
  }

  return NextResponse.json({ ok: true, operation: op });
}

export async function DELETE(_: Request, ctx: { params: { id: string } }) {
  const gate = await requireEditor();
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const id = String(ctx.params.id ?? "");
  const sb = supabaseServer();

  await sb.from("operation_participants").delete().eq("operation_id", id);
  await sb.from("operation_ratings").delete().eq("operation_id", id);
  await sb.from("marine_ratings").delete().eq("operation_id", id);
  await sb.from("operation_reports").delete().eq("operation_id", id);

  const { error } = await sb.from("operations").delete().eq("id", id);
  if (error) return NextResponse.json({ error: "Delete failed", details: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
