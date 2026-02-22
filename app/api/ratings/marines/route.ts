import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { requireFE } from "@/lib/authz";
import { requiredEnv, trelloBaseParams } from "@/app/api/_lib/trello";

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

  // Enrich rater names from permissions table (optional).
  // Enrich marine names from Trello card ids so the overview can show names even if the client hasn't loaded the roster yet.
  const [{ data: perms }, marineNameByCardId] = await Promise.all([
    sb.from("gm_user_permissions").select("discord_id, display_name"),
    (async () => {
      try {
        const boardId = requiredEnv("TRELLO_BOARD_ID");
        const { key, token } = trelloBaseParams();
        const url = new URL(`https://api.trello.com/1/boards/${boardId}/cards`);
        url.searchParams.set("key", key);
        url.searchParams.set("token", token);
        url.searchParams.set("fields", "name");
        url.searchParams.set("limit", "1000");
        const res = await fetch(url.toString(), { next: { revalidate: 60 } });
        if (!res.ok) return new Map<string, string>();
        const cards = (await res.json()) as Array<{ id: string; name: string }>;
        return new Map(cards.map((c) => [String(c.id), String(c.name)]));
      } catch {
        return new Map<string, string>();
      }
    })(),
  ]);

  const raterNameByDiscordId = new Map<string, string>();
  for (const p of perms ?? []) {
    const id = String((p as any).discord_id ?? "").trim();
    if (!id) continue;
    const name = String((p as any).display_name ?? "").trim();
    if (name) raterNameByDiscordId.set(id, name);
  }

  const [{ data: ratings, error: rErr }, { data: ops, error: oErr }] = await Promise.all([
    sb.from("marine_ratings").select("operation_id, marine_card_id, discord_id, stars, created_at"),
    sb.from("operations").select("id,title,start_at"),
  ]);

  if (rErr) return NextResponse.json({ error: "DB error", details: rErr.message }, { status: 500 });
  if (oErr) return NextResponse.json({ error: "DB error", details: oErr.message }, { status: 500 });

  const opMap = new Map<string, any>();
  for (const o of ops ?? []) opMap.set(String((o as any).id), o);

  // Shape rows to match what the UI expects (marine_name, rater_name, score, operation_title...)
  const rows = (ratings ?? []).map((x: any) => {
    const operation = opMap.get(String(x.operation_id)) ?? null;
    const marineCardId = String(x.marine_card_id);
    const raterId = String(x.discord_id);
    const score = Number(x.stars);

    return {
      operation_id: String(x.operation_id),
      operation_title: operation?.title ?? null,
      marine_card_id: marineCardId,
      marine_name: marineNameByCardId.get(marineCardId) ?? null,
      rater_discord_id: raterId,
      rater_name: raterNameByDiscordId.get(raterId) ?? null,
      score: Number.isFinite(score) ? score : null,
      created_at: x.created_at ?? null,
    };
  });

  const agg = new Map<string, { sum: number; n: number }>();
  for (const row of rows) {
    const k = (row as any).marine_card_id;
    const cur = agg.get(k) ?? { sum: 0, n: 0 };
    const s = Number((row as any).score);
    if (!Number.isFinite(s)) continue;
    cur.sum += s;
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
