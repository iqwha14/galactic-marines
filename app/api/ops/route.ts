import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { requireEditor } from "@/lib/authz";

/**
 * /api/ops
 * GET  -> list operations (public)
 * POST -> create operation (editors only)
 *
 * NOTE:
 * 405 means your route is missing the method export. This file MUST export POST.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toIsoOrNull(input: unknown): string | null {
  if (input == null) return null;
  const s = String(input).trim();
  if (!s) return null;

  // Accept already-ISO values
  const d1 = new Date(s);
  if (!Number.isNaN(d1.getTime())) return d1.toISOString();

  // Accept datetime-local "YYYY-MM-DDTHH:mm" (no seconds)
  // Interpret as local time and convert to ISO.
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (m) {
    const [_, yy, mm, dd, hh, mi, ss] = m;
    const d2 = new Date(
      Number(yy),
      Number(mm) - 1,
      Number(dd),
      Number(hh),
      Number(mi),
      ss ? Number(ss) : 0
    );
    if (!Number.isNaN(d2.getTime())) return d2.toISOString();
  }

  return null;
}

export async function GET() {
  try {
    const sb = supabaseServer();
    const { data, error } = await sb
      .from("operations")
      .select("*")
      .order("start_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        { error: "DB error", details: error.message, hint: (error as any).hint, code: (error as any).code },
        { status: 500 }
      );
    }

    return NextResponse.json({ operations: data ?? [] });
  } catch (e: any) {
    return NextResponse.json(
      { error: "Server error", details: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const gate = await requireEditor(req);
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

    const body = await req.json().catch(() => ({} as any));

    const title = String(body?.title ?? "").trim();
    const planet = String(body?.planet ?? "").trim();
    const units = Array.isArray(body?.units) ? body.units.map((x: any) => String(x)) : [];
    const outcome = String(body?.outcome ?? "Unklar");
    const summary = String(body?.summary ?? "");

    const start_at = toIsoOrNull(body?.start_at);
    const end_at = toIsoOrNull(body?.end_at);

    if (!title || !planet || !start_at) {
      return NextResponse.json(
        {
          error: "Missing/invalid fields",
          details: "Required: title, planet, start_at (valid datetime)",
          received: { title, planet, start_at: body?.start_at, end_at: body?.end_at },
        },
        { status: 400 }
      );
    }

    // created_by_discord_id is often NOT NULL in schemas
    const created_by_discord_id = String((gate.session as any)?.discordId ?? "").trim();
    if (!created_by_discord_id) {
      return NextResponse.json(
        {
          error: "Auth missing discordId",
          details:
            "Dein Login ist da, aber im Session-Token fehlt discordId. Prüfe deine NextAuth callbacks/jwt.",
        },
        { status: 401 }
      );
    }

    const participants = Array.isArray(body?.participants) ? body.participants : [];

    const sb = supabaseServer();

    const { data: op, error: opErr } = await sb
      .from("operations")
      .insert({
        title,
        planet,
        start_at,
        end_at,
        units,
        outcome,
        summary,
        created_by_discord_id,
      })
      .select("*")
      .single();

    if (opErr) {
      return NextResponse.json(
        {
          error: "DB insert failed",
          details: opErr.message,
          hint: (opErr as any).hint,
          code: (opErr as any).code,
        },
        { status: 500 }
      );
    }

    if (participants.length) {
      const rows = participants
        .map((p: any) => ({
          operation_id: op.id,
          marine_card_id: String(p?.marine_card_id ?? ""),
          role: p?.role ? String(p.role) : null,
          is_lead: !!p?.is_lead,
        }))
        .filter((r: any) => r.marine_card_id);

      if (rows.length) {
        const { error: partErr } = await sb.from("operation_participants").insert(rows);
        if (partErr) {
          // Rollback the op so you don't get "dangling" operations without participants
          await sb.from("operations").delete().eq("id", op.id);
          return NextResponse.json(
            {
              error: "DB participants insert failed",
              details: partErr.message,
              hint: (partErr as any).hint,
              code: (partErr as any).code,
            },
            { status: 500 }
          );
        }
      }
    }

    return NextResponse.json({ ok: true, operation: op });
  } catch (e: any) {
    return NextResponse.json(
      { error: "Server error", details: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
