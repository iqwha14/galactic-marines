import { NextResponse } from "next/server";
import { supabaseAdmin, publicUrl } from "@/lib/supabase";
import { requireEditor } from "@/lib/authz";

function mustBucket(): string {
  const b = (process.env.SUPABASE_OPS_BUCKET ?? "ops").trim();
  if (!b) throw new Error("Missing SUPABASE_OPS_BUCKET (or set to 'ops')");
  return b;
}

// POST /api/ops/:id/upload  (editor)
// multipart/form-data: file=<image>
export async function POST(req: Request, ctx: { params: { id: string } }) {
  const gate = await requireEditor(req);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const id = String(ctx.params.id ?? "");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Missing file" }, { status: 400 });
  if (!file.type?.startsWith("image/")) return NextResponse.json({ error: "File must be an image" }, { status: 400 });

  const bucket = mustBucket();
  const sb = supabaseAdmin();

  const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]+/g, "");
  const safeExt = ext || "png";
  const path = `ops/${id}/${Date.now()}-${Math.random().toString(16).slice(2)}.${safeExt}`;

  const buf = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await sb.storage.from(bucket).upload(path, buf, {
    contentType: file.type,
    upsert: true,
  });

  if (upErr) return NextResponse.json({ error: "Upload failed", details: upErr.message }, { status: 500 });

  const url = publicUrl(bucket, path);
  const { error: dbErr } = await sb.from("operations").update({ image_url: url }).eq("id", id);
  if (dbErr) return NextResponse.json({ error: "DB update failed", details: dbErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, image_url: url });
}
