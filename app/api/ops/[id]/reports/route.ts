import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { requireSignedIn } from "@/lib/authz";

// POST /api/ops/:id/reports (signed in)
// body: { title: string, content_md: string }
export async function POST(req: Request, ctx: { params: { id: string } }) {
  const gate = await requireSignedIn(req);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const operation_id = String(ctx.params.id ?? "");
  const body = await req.json().catch(() => ({}));
  const title = String(body?.title ?? "").trim().slice(0, 160);
  const content_md = String(body?.content_md ?? "").trim().slice(0, 20000);

  if (!operation_id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  if (!title || !content_md) return NextResponse.json({ error: "Missing title/content" }, { status: 400 });

  const sb = supabaseServer();
  const author_discord_id = String(gate.session?.discordId ?? "");

  const { data, error } = await sb
    .from("operation_reports")
    .insert({ operation_id, author_discord_id, title, content_md })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: "DB error", details: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, report: data });
}
