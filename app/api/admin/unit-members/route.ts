import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/authz";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sbErrorPayload(e: any) {
  return {
    error: "Supabase error",
    details: e?.message ?? String(e),
    hint: (e as any)?.hint,
    code: (e as any)?.code,
  };
}

// GET: list unit members
export async function GET(req: Request) {
  const gate = await requireAdmin(req);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  try {
    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from("gm_unit_members")
      .select("discord_id,marine_card_id,display_name,updated_at")
      .order("updated_at", { ascending: false })
      .limit(2000);
    if (error) return NextResponse.json(sbErrorPayload(error), { status: 500 });
    return NextResponse.json({ ok: true, rows: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ error: "Server error", details: e?.message ?? String(e) }, { status: 500 });
  }
}

// POST: upsert unit member
// body: { discord_id: string, marine_card_id: string, display_name?: string|null }
export async function POST(req: Request) {
  const gate = await requireAdmin(req);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  try {
    const body = await req.json().catch(() => ({} as any));
    const discord_id = String(body?.discord_id ?? "").trim();
    const marine_card_id = String(body?.marine_card_id ?? "").trim();
    const display_name = body?.display_name != null ? String(body.display_name).trim() : null;

    if (!discord_id) return NextResponse.json({ error: "discord_id required" }, { status: 400 });
    if (!marine_card_id) return NextResponse.json({ error: "marine_card_id required" }, { status: 400 });

    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from("gm_unit_members")
      .upsert(
        { discord_id, marine_card_id, display_name: display_name || null, updated_at: new Date().toISOString() },
        { onConflict: "discord_id" }
      )
      .select("discord_id,marine_card_id,display_name,updated_at")
      .single();

    if (error) return NextResponse.json(sbErrorPayload(error), { status: 500 });
    return NextResponse.json({ ok: true, row: data });
  } catch (e: any) {
    return NextResponse.json({ error: "Server error", details: e?.message ?? String(e) }, { status: 500 });
  }
}

// DELETE: remove unit member
// body: { discord_id: string }
export async function DELETE(req: Request) {
  const gate = await requireAdmin(req);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  try {
    const body = await req.json().catch(() => ({} as any));
    const discord_id = String(body?.discord_id ?? "").trim();
    if (!discord_id) return NextResponse.json({ error: "discord_id required" }, { status: 400 });

    const sb = supabaseAdmin();
    const { error } = await sb.from("gm_unit_members").delete().eq("discord_id", discord_id);
    if (error) return NextResponse.json(sbErrorPayload(error), { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: "Server error", details: e?.message ?? String(e) }, { status: 500 });
  }
}
