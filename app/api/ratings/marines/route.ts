import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { requireFE } from "@/lib/authz";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/ratings/marines
 * FE/Einheitsleitung only.
 * Returns:
 * - summary per marine_card_id (avg, count)
 * - all entries (who rated whom in which op)
 */
export async function GET(req: Request) {
  const gate = await requireFE(req);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const sb = supabaseServer();

  const [{ data: ratings, error: rErr }, { data: ops, error: oErr }] = await Promise.all([
    sb.from("marine_ratings").select("operation_id, marine_card_id, discord_id, stars, created_at"),
    sb.from("operations").select("id,title,start_at"),
  ]);

  if (rErr) return NextResponse.json({ error: "DB error", details: rErr.message }, { status: 500 });
  if (oErr) return NextResponse.json({ error: "DB error", details: oErr.message }, { status: 500 });

  const opMap = new Map<string, any>();
  for (const o of ops ?? []) opMap.set(String((o as any).id), o);

  const rows = (ratings ?? []).map((x: any) => ({
    operation_id: String(x.operation_id),
    marine_card_id: String(x.marine_card_id),
    discord_id: String(x.discord_id),
    stars: Number(x.stars),
    created_at: x.created_at ?? null,
    operation: opMap.get(String(x.operation_id)) ?? null,
  }));

  const agg = new Map<string, { sum: number; n: number }>();
  for (const row of rows) {
    const k = row.marine_card_id;
    const cur = agg.get(k) ?? { sum: 0, n: 0 };
    cur.sum += row.stars;
    cur.n += 1;
    agg.set(k, cur);
  }

  const summary = [...agg.entries()].map(([marine_card_id, v]) => ({
    marine_card_id,
    avg: v.n ? v.sum / v.n : 0,
    count: v.n,
  }));

  summary.sort((a, b) => (b.avg - a.avg) || (b.count - a.count) || a.marine_card_id.localeCompare(b.marine_card_id));

  return NextResponse.json({ ok: true, summary, rows });
}
