import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { requireSignedIn } from "@/lib/authz";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/ops/:id/killlogs
export async function GET(_: Request, ctx: { params: { id: string } }) {
  const operation_id = String(ctx.params.id ?? "").trim();
  if (!operation_id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const sb = supabaseServer();
  try {
    const { data, error } = await sb
      .from("operation_killlogs")
      .select("*")
      .eq("operation_id", operation_id)
      .order("created_at", { ascending: false });
    if (error) return NextResponse.json({ error: "DB error", details: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, rows: data ?? [] });
  } catch {
    return NextResponse.json({ ok: true, rows: [] });
  }
}

// POST /api/ops/:id/killlogs
// body: { deaths: number, text: string }
export async function POST(req: Request, ctx: { params: { id: string } }) {
  const gate = await requireSignedIn(req);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const operation_id = String(ctx.params.id ?? "").trim();
  if (!operation_id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const deaths = Math.max(1, Math.min(99, Number(body?.deaths ?? 1)));
  const text = String(body?.text ?? "").trim().slice(0, 500);
  if (!Number.isFinite(deaths) || deaths <= 0) return NextResponse.json({ error: "Invalid deaths" }, { status: 400 });
  if (!text) return NextResponse.json({ error: "Missing text", details: "Bitte beschreibe kurz den Killlog." }, { status: 400 });

  const sb = supabaseServer();
  const discord_id = String(gate.session?.discordId ?? "").trim();

  // Best-effort: resolve marine_card_id + display_name from gm_unit_members
  const { data: member } = await sb
    .from("gm_unit_members")
    .select("marine_card_id, display_name")
    .eq("discord_id", discord_id)
    .maybeSingle();

  const marine_card_id = String((member as any)?.marine_card_id ?? "").trim() || null;
  const display_name =
    String((member as any)?.display_name ?? "").trim() ||
    String((gate.session as any)?.user?.name ?? "").trim() ||
    null;

  // If the table isn't created yet, fail gracefully.
  try {
    const { error } = await sb.from("operation_killlogs").insert({
      operation_id,
      discord_id,
      marine_card_id,
      display_name,
      deaths,
      text,
    });
    if (error) return NextResponse.json({ error: "DB error", details: error.message }, { status: 500 });
  } catch (e: any) {
    return NextResponse.json(
      {
        error: "Killlog table missing",
        details: "operation_killlogs existiert noch nicht. Bitte SQL-Migration ausführen.",
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
