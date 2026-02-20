import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { requireEditor } from "@/lib/authz";

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

  return NextResponse.json({
    operation: op,
    participants: participants ?? [],
    ratings: ratings ?? [],
    marineRatings: marineRatings ?? [],
    reports: reports ?? [],
  });
}

export async function PUT(req: Request, ctx: { params: { id: string } }) {
  const gate = await requireEditor();
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const id = String(ctx.params.id ?? "");
  const body = await req.json().catch(() => ({}));

  const patch: any = {};
  const allow = ["title", "planet", "start_at", "end_at", "units", "outcome", "summary", "image_url"];
  for (const k of allow) {
    if (k in body) patch[k] = body[k];
  }

  const participants = Array.isArray(body?.participants) ? body.participants : null;

  const sb = supabaseServer();

  const { data: op, error: upErr } = await sb.from("operations").update(patch).eq("id", id).select("*").single();
  if (upErr) return NextResponse.json({ error: "Update failed", details: upErr.message }, { status: 500 });

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
      if (partErr) return NextResponse.json({ error: "Participants update failed", details: partErr.message }, { status: 500 });
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
