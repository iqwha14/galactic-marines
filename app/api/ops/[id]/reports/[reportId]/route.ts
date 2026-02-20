import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { requireSignedIn } from "@/lib/authz";

export async function PUT(req: Request, ctx: { params: { id: string; reportId: string } }) {
  const gate = await requireSignedIn();
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const reportId = String(ctx.params.reportId ?? "");
  const body = await req.json().catch(() => ({}));

  const patch: any = {};
  if ("title" in body) patch.title = String(body.title ?? "").trim();
  if ("content_md" in body) patch.content_md = String(body.content_md ?? "");

  const sb = supabaseServer();
  const { data: rep, error: repErr } = await sb.from("operation_reports").select("*").eq("id", reportId).single();
  if (repErr) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const discordId = String((gate.session as any).discordId ?? "");
  const isEditor = !!(gate.session as any).isEditor;

  if (!isEditor && rep.author_discord_id !== discordId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await sb
    .from("operation_reports")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", reportId)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: "DB error", details: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, report: data });
}

export async function DELETE(_: Request, ctx: { params: { id: string; reportId: string } }) {
  const gate = await requireSignedIn();
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const reportId = String(ctx.params.reportId ?? "");
  const sb = supabaseServer();

  const { data: rep, error: repErr } = await sb.from("operation_reports").select("*").eq("id", reportId).single();
  if (repErr) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const discordId = String((gate.session as any).discordId ?? "");
  const isEditor = !!(gate.session as any).isEditor;

  if (!isEditor && rep.author_discord_id !== discordId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error } = await sb.from("operation_reports").delete().eq("id", reportId);
  if (error) return NextResponse.json({ error: "DB error", details: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
