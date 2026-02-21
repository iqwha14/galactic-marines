import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/authz";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = {
  discord_id: string;
  display_name: string | null;
  is_editor: boolean;
  is_admin: boolean;
  can_see_uo: boolean;
  can_see_fe: boolean;
  updated_at?: string;
};

function sbErrorPayload(e: any) {
  return {
    error: "Supabase error",
    details: e?.message ?? String(e),
    hint: (e as any)?.hint,
    code: (e as any)?.code,
  };
}

export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  try {
    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from("gm_user_permissions")
      .select("discord_id,display_name,is_editor,is_admin,can_see_uo,can_see_fe,updated_at")
      .order("updated_at", { ascending: false })
      .limit(500);

    if (error) return NextResponse.json(sbErrorPayload(error), { status: 500 });
    return NextResponse.json({ ok: true, rows: (data ?? []) as Row[] });
  } catch (e: any) {
    return NextResponse.json({ error: "Server error", details: e?.message ?? String(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const gate = await requireAdmin(req);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  try {
    const body = await req.json().catch(() => ({} as any));
    const discord_id = String(body?.discord_id ?? "").trim();
    if (!discord_id) return NextResponse.json({ error: "discord_id required" }, { status: 400 });

    const row: Row = {
      discord_id,
      display_name: body?.display_name != null ? String(body.display_name) : null,
      is_editor: !!body?.is_editor,
      is_admin: !!body?.is_admin,
      can_see_uo: !!body?.can_see_uo,
      can_see_fe: !!body?.can_see_fe,
    };

    if (row.is_admin) {
      row.is_editor = true;
      row.can_see_uo = true;
      row.can_see_fe = true;
    }
    if (row.is_editor) {
      row.can_see_fe = true;
      row.can_see_uo = true;
    }

    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from("gm_user_permissions")
      .upsert({ ...row, updated_at: new Date().toISOString() }, { onConflict: "discord_id" })
      .select("discord_id,display_name,is_editor,is_admin,can_see_uo,can_see_fe,updated_at")
      .single();

    if (error) return NextResponse.json(sbErrorPayload(error), { status: 500 });
    return NextResponse.json({ ok: true, row: data });
  } catch (e: any) {
    return NextResponse.json({ error: "Server error", details: e?.message ?? String(e) }, { status: 500 });
  }
}
