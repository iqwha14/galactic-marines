import { NextResponse } from "next/server";
import { requireSignedIn } from "@/app/api/_lib/authz";
import { supabaseAdmin } from "@/app/api/_lib/supabase";

export async function GET(req: Request, ctx: { params: { id: string } }) {
  const gate = await requireSignedIn(req as any);

  if (!gate.ok) {
    return NextResponse.json(
      { error: gate.error },
      { status: gate.status }
    );
  }

  const id = String(ctx.params.id ?? "");
  const sb = supabaseAdmin();

  const { data, error } = await sb
    .from("operation_reports")
    .select("*")
    .eq("operation_id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}