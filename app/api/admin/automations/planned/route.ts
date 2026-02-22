import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/authz";
import { supabaseAdmin } from "@/lib/supabase";
import { computeNextRunAt } from "@/lib/timezone";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Schedule = "once" | "daily" | "weekly";

function clampDow(d: any): number | null {
  const n = Number(d);
  if (!Number.isFinite(n)) return null;
  if (n < 1 || n > 7) return null;
  return n;
}

export async function GET(req: Request) {
  const gate = await requireAdmin(req);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  try {
    const sb = supabaseAdmin();
    const { data, error } = await sb.from("gm_planned_messages").select("*").order("created_at", { ascending: false });
    if (error) return NextResponse.json({ ok: true, items: [], warning: "Tabelle gm_planned_messages nicht vorhanden (supabase/automations.sql ausführen)." });
    return NextResponse.json({ ok: true, items: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ error: "Server error", details: e?.message ?? String(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const gate = await requireAdmin(req);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const body = await req.json().catch(() => ({} as any));
  const id = String(body?.id ?? "").trim() || null;
  const enabled = body?.enabled === undefined ? true : !!body?.enabled;
  const webhook_url = String(body?.webhook_url ?? "").trim();
  const content = String(body?.content ?? "").trim();
  const schedule = String(body?.schedule ?? "once").trim() as Schedule;
  const timezone = String(body?.timezone ?? "Europe/Berlin").trim() || "Europe/Berlin";
  const run_at = body?.run_at ? new Date(body.run_at).toISOString() : null;
  const time_of_day = body?.time_of_day ? String(body.time_of_day).trim() : null;
  const day_of_week = clampDow(body?.day_of_week);

  if (!webhook_url) return NextResponse.json({ error: "webhook_url required" }, { status: 400 });
  if (!content) return NextResponse.json({ error: "content required" }, { status: 400 });
  if (!(["once", "daily", "weekly"] as string[]).includes(schedule)) return NextResponse.json({ error: "invalid schedule" }, { status: 400 });
  if (schedule === "once" && !run_at) return NextResponse.json({ error: "run_at required for once" }, { status: 400 });
  if (schedule !== "once" && !time_of_day) return NextResponse.json({ error: "time_of_day required for daily/weekly" }, { status: 400 });
  if (schedule === "weekly" && !day_of_week) return NextResponse.json({ error: "day_of_week required for weekly" }, { status: 400 });

  const next = computeNextRunAt({
    schedule,
    timeZone: timezone,
    runAt: run_at,
    timeOfDay: time_of_day,
    dayOfWeek: day_of_week,
  });

  const payload: any = {
    enabled,
    webhook_url,
    content,
    schedule,
    timezone,
    run_at,
    time_of_day,
    day_of_week,
    next_run_at: next ? next.toISOString() : null,
    updated_at: new Date().toISOString(),
  };
  if (id) payload.id = id;

  try {
    const sb = supabaseAdmin();
    const { data, error } = await sb.from("gm_planned_messages").upsert(payload, { onConflict: "id" }).select("*").single();
    if (error) return NextResponse.json({ error: "Supabase error", details: error.message, code: (error as any).code }, { status: 500 });
    return NextResponse.json({ ok: true, item: data });
  } catch (e: any) {
    return NextResponse.json({ error: "Server error", details: e?.message ?? String(e) }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const gate = await requireAdmin(req);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const url = new URL(req.url);
  const id = String(url.searchParams.get("id") ?? "").trim();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  try {
    const sb = supabaseAdmin();
    const { error } = await sb.from("gm_planned_messages").delete().eq("id", id);
    if (error) return NextResponse.json({ error: "Supabase error", details: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: "Server error", details: e?.message ?? String(e) }, { status: 500 });
  }
}
