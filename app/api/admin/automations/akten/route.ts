import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/authz";
import { supabaseAdmin } from "@/lib/supabase";
import { computeNextRunAt } from "@/lib/timezone";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clampDow(d: any): number {
  const n = Number(d);
  if (!Number.isFinite(n)) return 1;
  if (n < 1) return 1;
  if (n > 7) return 7;
  return n;
}


function parsePoolInput(input: any): { key: string; mention_type: "user" | "role"; mention_id: string; label?: string } | null {
  const raw = String(input ?? "").trim();
  if (!raw) return null;

  const [left, labelRaw] = raw.split("|").map((s) => s.trim());
  const label = labelRaw || undefined;

  // Allowed formats:
  //  - user:123456789012345678|Label
  //  - role:123456789012345678|Label
  //  - <@123...>|Label   or <@!123...>|Label
  //  - <@&123...>|Label
  //  - 123456789012345678|Label  (defaults to user)
  const mRole = left.match(/^<@&(\d+)>$/);
  if (mRole) return { key: `role:${mRole[1]}`, mention_type: "role", mention_id: mRole[1], label };

  const mUser = left.match(/^<@!?(\d+)>$/);
  if (mUser) return { key: `user:${mUser[1]}`, mention_type: "user", mention_id: mUser[1], label };

  const mTyped = left.match(/^(user|role):(\d+)$/i);
  if (mTyped) return { key: `${mTyped[1].toLowerCase()}:${mTyped[2]}`, mention_type: mTyped[1].toLowerCase() as any, mention_id: mTyped[2], label };

  const mDigits = left.match(/^(\d{6,})$/);
  if (mDigits) return { key: `user:${mDigits[1]}`, mention_type: "user", mention_id: mDigits[1], label };

  return null;
}

function clampInt(n: any, min: number, max: number, fallback: number): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(v)));
}

export async function GET(req: Request) {
  const gate = await requireAdmin(req);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  try {
    const sb = supabaseAdmin();
    const { data: settings, error: err1 } = await sb.from("gm_akten_settings").select("*").eq("id", 1).single();
    const { data: pool, error: err2 } = await sb.from("gm_akten_pool").select("*");
    const { data: history, error: err3 } = await sb
      .from("gm_akten_history")
      .select("*")
      .order("happened_at", { ascending: false })
      .limit(30);

    if (err1) {
      return NextResponse.json({
        ok: true,
        warning: "Tabellen gm_akten_* nicht vorhanden (supabase/automations.sql ausführen).",
        settings: null,
        pool: [],
        history: [],
      });
    }

    return NextResponse.json({ ok: true, settings, pool: err2 ? [] : pool ?? [], history: err3 ? [] : history ?? [] });
  } catch (e: any) {
    return NextResponse.json({ error: "Server error", details: e?.message ?? String(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const gate = await requireAdmin(req);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const body = await req.json().catch(() => ({} as any));
  const op = String(body?.op ?? "").trim();
  const sb = supabaseAdmin();

  try {
    if (op === "save_settings") {
      const enabled = !!body?.enabled;
      const webhook_url = String(body?.webhook_url ?? "").trim();
      const timezone = String(body?.timezone ?? "Europe/Berlin").trim() || "Europe/Berlin";
      const day_of_week = clampDow(body?.day_of_week);
      const time_of_day = String(body?.time_of_day ?? "18:00").trim();
      const followup_delay_minutes = clampInt(body?.followup_delay_minutes, 5, 24 * 60, 180);

      const nextPoll = computeNextRunAt({ schedule: "weekly", timeZone: timezone, timeOfDay: time_of_day, dayOfWeek: day_of_week });

      const { data, error } = await sb
        .from("gm_akten_settings")
        .upsert(
          {
            id: 1,
            enabled,
            webhook_url,
            timezone,
            day_of_week,
            time_of_day,
            followup_delay_minutes,
            next_poll_at: nextPoll ? nextPoll.toISOString() : null,
          },
          { onConflict: "id" }
        )
        .select("*")
        .single();

      if (error)
        return NextResponse.json(
          { error: "Supabase error", details: error.message, code: (error as any).code },
          { status: 500 }
        );
      return NextResponse.json({ ok: true, settings: data });
    }

    if (op === "add_pool") {
      const name = String(body?.name ?? "").trim();
      if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });

      const { data, error } = await sb.from("gm_akten_pool").upsert({ name }, { onConflict: "name" }).select("*").single();
      if (error) return NextResponse.json({ error: "Supabase error", details: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, item: data });
    }

    if (op === "remove_pool") {
      const name = String(body?.name ?? "").trim();
      if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
      const { error } = await sb.from("gm_akten_pool").delete().eq("name", name);
      if (error) return NextResponse.json({ error: "Supabase error", details: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    if (op === "reset_fairness") {
      await sb.from("gm_akten_pool").update({ times_assigned: 0, last_assigned_at: null });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown op" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: "Server error", details: e?.message ?? String(e) }, { status: 500 });
  }
}
