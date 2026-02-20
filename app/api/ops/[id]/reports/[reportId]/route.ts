import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/api/_lib/supabase";
import { requireSignedIn } from "@/app/api/_lib/authz";

export async function PATCH(req: Request, ctx: { params: { id: string; reportId: string } }) {
  const gate = await requireSignedIn(req);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const opId = String(ctx?.params?.id ?? "");
  const reportId = String(ctx?.params?.reportId ?? "");
  const body = await req.json().catch(() => ({}));
  const content = String(body?.content ?? "").trim();

  if (!opId || !reportId) return NextResponse.json({ error: "Missing ids" }, { status: 400 });
  if (!content) return NextResponse.json({ error: "Missing content" }, { status: 400 });

  const sb = supabaseAdmin();
  const { error } = await sb
    .from("op_reports")
    .update({ content, updated_at: new Date().toISOString() })
    .eq("id", reportId)
    .eq("op_id", opId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
