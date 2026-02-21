import { NextResponse } from "next/server";
import { requireEditor } from "@/lib/authz";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireEditor();
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  try {
    const sb = supabaseAdmin();
    const [{ data: operations }, { data: participants }] = await Promise.all([
      sb.from("operations").select("*").order("start_at", { ascending: false }).limit(1000),
      sb.from("operation_participants").select("*").limit(5000),
    ]);
    return NextResponse.json({ ok: true, operations: operations ?? [], participants: participants ?? [] });
  } catch (e: any) {
    return NextResponse.json({ error: "Server error", details: e?.message ?? String(e) }, { status: 500 });
  }
}
