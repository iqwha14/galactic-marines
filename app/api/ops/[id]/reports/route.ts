import { NextResponse } from "next/server";
import { supabaseServer } from "../../../_lib/supabase";
import { requireSignedIn } from "../../../_lib/authz";

export async function GET(_: Request, ctx: { params: { id: string } }) {
  const gate = await requireSignedIn();
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const id = String(ctx.params.id ?? "");
  const sb = supabaseServer();

  const { data, error } = await sb
    .from("operation_reports")
    .select("*")
    .eq("operation_id", id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: "DB error", details: error.message }, { status: 500 });
  return NextResponse.json({ reports: data ?? [] });
}

export async function POST(req: Request, ctx: { params: { id: string } }) {
  const gate = await requireSignedIn();
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const id = String(ctx.params.id ?? "");
  const body = await req.json().catch(() => ({}));
  const title = String(body?.title ?? "").trim();
  const content_md = String(body?.content_md ?? "");

  if (!title || !content_md) return NextResponse.json({ error: "title and content_md required" }, { status: 400 });

  const author_discord_id = String((gate.session as any).discordId ?? "");
  const sb = supabaseServer();

  const { data, error } = await sb
    .from("operation_reports")
    .insert({ operation_id: id, author_discord_id, title, content_md })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: "DB error", details: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, report: data });
}
