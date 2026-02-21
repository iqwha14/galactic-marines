import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/authz";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Optional table:
 * gm_feature_flags(key text pk, enabled boolean default false, updated_at timestamptz default now())
 */
export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  try {
    const sb = supabaseAdmin();
    const { data, error } = await sb.from("gm_feature_flags").select("*").order("key", { ascending: true });
    if (error) return NextResponse.json({ ok: true, flags: [], warning: "Tabelle gm_feature_flags nicht vorhanden (Optional)." });
    return NextResponse.json({ ok: true, flags: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ error: "Server error", details: e?.message ?? String(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const gate = await requireAdmin(req);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const body = await req.json().catch(() => ({} as any));
  const key = String(body?.key ?? "").trim();
  const enabled = !!body?.enabled;
  if (!key) return NextResponse.json({ error: "key required" }, { status: 400 });

  try {
    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from("gm_feature_flags")
      .upsert({ key, enabled, updated_at: new Date().toISOString() }, { onConflict: "key" })
      .select("*")
      .single();

    if (error) return NextResponse.json({ error: "Supabase error", details: error.message, code: (error as any).code }, { status: 500 });
    return NextResponse.json({ ok: true, flag: data });
  } catch (e: any) {
    return NextResponse.json({ error: "Server error", details: e?.message ?? String(e) }, { status: 500 });
  }
}
