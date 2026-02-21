import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/authz";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Uses gm_feature_flags with key 'emergency_lockdown'
 */
export async function POST(req: Request) {
  const gate = await requireAdmin(req);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const body = await req.json().catch(() => ({} as any));
  const enabled = !!body?.enabled;

  try {
    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from("gm_feature_flags")
      .upsert({ key: "emergency_lockdown", enabled, updated_at: new Date().toISOString() }, { onConflict: "key" })
      .select("*")
      .single();

    if (error) {
      return NextResponse.json(
        { error: "Supabase error", details: error.message, hint: (error as any).hint, code: (error as any).code },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, flag: data });
  } catch (e: any) {
    return NextResponse.json({ error: "Server error", details: e?.message ?? String(e) }, { status: 500 });
  }
}
