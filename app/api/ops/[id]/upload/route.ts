import { NextResponse } from "next/server";
import { supabaseServer, publicUrl } from "@/lib/supabase";
import { requireEditor } from "@/lib/authz";

const BUCKET = "operation-images";

export async function POST(req: Request, ctx: { params: { id: string } }) {
  const gate = await requireEditor();
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const id = String(ctx.params.id ?? "");
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Expected form-data" }, { status: 400 });

  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Missing file" }, { status: 400 });

  if (!file.type.startsWith("image/")) return NextResponse.json({ error: "Only images allowed" }, { status: 400 });

  const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
  const safeExt = ext || "png";
  const path = `${id}/${Date.now()}.${safeExt}`;

  const sb = supabaseServer();
  const bytes = new Uint8Array(await file.arrayBuffer());

  const { error: upErr } = await sb.storage.from(BUCKET).upload(path, bytes, {
    contentType: file.type,
    upsert: false,
  });

  if (upErr) {
    return NextResponse.json(
      {
        error: "Upload failed",
        details: upErr.message,
        hint: "Supabase: Storage Bucket 'operation-images' erstellen und PUBLIC machen.",
      },
      { status: 500 }
    );
  }

  const url = publicUrl(BUCKET, path);

  const { error: dbErr } = await sb.from("operations").update({ image_url: url }).eq("id", id);
  if (dbErr) return NextResponse.json({ error: "DB update failed", details: dbErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, image_url: url });
}
