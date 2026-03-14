import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { requireEditor } from "@/lib/authz";

function normalizeDateTime(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) throw new Error("empty");
  const m = raw.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  const candidate = m ? `${raw}:00` : raw;
  const d = new Date(candidate);
  if (Number.isNaN(d.getTime())) throw new Error(`invalid: ${raw}`);
  return d.toISOString();
}

/**
 * /api/ops/:id
 * GET: op + participants + ratings + reports (public)
 * PUT: update op + replace participants (editor)
 * DELETE: delete op (editor)
 */

export async function GET(_: Request, ctx: { params: { id: string } }) {
  const id = String(ctx.params.id ?? "");
  const sb = supabaseServer();

  const { data: op, error: opErr } = await sb.from("operations").select("*").eq("id", id).single();
  if (opErr) return NextResponse.json({ error: "Not found", details: opErr.message }, { status: 404 });

  const [{ data: participants }, { data: ratings }, { data: marineRatings }, { data: reports }] = await Promise.all([
    sb.from("operation_participants").select("*").eq("operation_id", id),
    sb.from("operation_ratings").select("*").eq("operation_id", id),
    sb.from("marine_ratings").select("*").eq("operation_id", id),
    sb.from("operation_reports").select("*").eq("operation_id", id).order("created_at", { ascending: false }),
  ]);

  const discordIds = new Set<string>();
  const cardIds = new Set<string>();

  for (const r of ratings ?? []) {
    const did = String((r as any)?.discord_id ?? "").trim();
    if (did) discordIds.add(did);
  }
  for (const r of marineRatings ?? []) {
    const did = String((r as any)?.discord_id ?? "").trim();
    if (did) discordIds.add(did);
    const cid = String((r as any)?.marine_card_id ?? "").trim();
    if (cid) cardIds.add(cid);
  }
  for (const p of participants ?? []) {
    const raw = String((p as any)?.marine_card_id ?? "").trim();
    if (!raw) continue;
    cardIds.add(raw);
    // Legacy installs may have stored discord ids in operation_participants.marine_card_id.
    if (/^\d{8,}$/.test(raw)) discordIds.add(raw);
  }
  for (const r of reports ?? []) {
    const did = String((r as any)?.author_discord_id ?? "").trim();
    if (did) discordIds.add(did);
  }
  const opMvpId = String((op as any)?.mvp_card_id ?? "").trim();
  if (opMvpId) {
    cardIds.add(opMvpId);
    if (/^\d{8,}$/.test(opMvpId)) discordIds.add(opMvpId);
  }

  let unitMembersByDiscord: any[] = [];
  let unitMembersByCard: any[] = [];
  try {
    if (discordIds.size) {
      const { data } = await sb
        .from("gm_unit_members")
        .select("discord_id, marine_card_id, display_name")
        .in("discord_id", [...discordIds]);
      unitMembersByDiscord = data ?? [];
    }
    if (cardIds.size) {
      const { data } = await sb
        .from("gm_unit_members")
        .select("discord_id, marine_card_id, display_name")
        .in("marine_card_id", [...cardIds]);
      unitMembersByCard = data ?? [];
    }
  } catch {
    unitMembersByDiscord = [];
    unitMembersByCard = [];
  }

  const unitMembers = [...unitMembersByDiscord, ...unitMembersByCard];
  const displayNameByDiscord = new Map<string, string>();
  const displayNameByCard = new Map<string, string>();
  const cardByDiscord = new Map<string, string>();

  for (const m of unitMembers) {
    const did = String((m as any)?.discord_id ?? "").trim();
    const cid = String((m as any)?.marine_card_id ?? "").trim();
    const dn = String((m as any)?.display_name ?? "").trim();
    if (did && dn && !displayNameByDiscord.has(did)) displayNameByDiscord.set(did, dn);
    if (cid && dn && !displayNameByCard.has(cid)) displayNameByCard.set(cid, dn);
    if (did && cid && !cardByDiscord.has(did)) cardByDiscord.set(did, cid);
  }

  let trelloNameByCard = new Map<string, string>();
  try {
    const fallbackCardIds = new Set<string>();
    for (const cid of [...cardIds, ...cardByDiscord.values()]) {
      if (!cid) continue;
      if (!displayNameByCard.get(cid) && !/^\d{8,}$/.test(cid)) fallbackCardIds.add(cid);
    }

    if (fallbackCardIds.size) {
      const { requiredEnv, trelloBaseParams } = await import("@/app/api/_lib/trello");
      const boardId = requiredEnv("TRELLO_BOARD_ID");
      const { key, token } = trelloBaseParams();
      const url = new URL(`https://api.trello.com/1/boards/${boardId}/cards`);
      url.searchParams.set("key", key);
      url.searchParams.set("token", token);
      url.searchParams.set("fields", "name");
      url.searchParams.set("limit", "1000");
      const res = await fetch(url.toString(), { next: { revalidate: 60 } });
      if (res.ok) {
        const cards = (await res.json()) as Array<{ id: string; name: string }>;
        trelloNameByCard = new Map(cards.map((c) => [String(c.id), String(c.name)]));
      }
    }
  } catch {
    trelloNameByCard = new Map<string, string>();
  }

  const effectiveCardId = (rawValue: any) => {
    const raw = String(rawValue ?? "").trim();
    if (!raw) return "";
    return cardByDiscord.get(raw) ?? raw;
  };
  const nameForDiscord = (didRaw: any) => {
    const did = String(didRaw ?? "").trim();
    if (!did) return null;
    const direct = displayNameByDiscord.get(did);
    if (direct) return direct;
    const cid = cardByDiscord.get(did);
    if (cid) return displayNameByCard.get(cid) ?? trelloNameByCard.get(cid) ?? null;
    return null;
  };
  const nameForCard = (cidRaw: any) => {
    const effective = effectiveCardId(cidRaw);
    if (!effective) return null;
    const direct = displayNameByCard.get(effective);
    if (direct) return direct;
    return trelloNameByCard.get(effective) ?? nameForDiscord(cidRaw);
  };

  const participantsEnriched = (participants ?? []).map((p: any) => {
    const rawId = String(p?.marine_card_id ?? "").trim();
    const resolvedCardId = effectiveCardId(rawId);
    return {
      ...p,
      marine_card_id: rawId,
      effective_marine_card_id: resolvedCardId || rawId,
      display_name: nameForCard(rawId),
    };
  });

  const ratingsEnriched = (ratings ?? []).map((r: any) => ({
    ...r,
    rater_name: r?.rater_name ?? nameForDiscord(r?.discord_id),
  }));
  const marineRatingsEnriched = (marineRatings ?? []).map((r: any) => ({
    ...r,
    rater_name: r?.rater_name ?? nameForDiscord(r?.discord_id),
    marine_name: r?.marine_name ?? nameForCard(r?.marine_card_id),
  }));
  const reportsEnriched = (reports ?? []).map((r: any) => ({
    ...r,
    author_name: r?.author_name ?? nameForDiscord(r?.author_discord_id),
  }));

  let killlogs: any[] = [];
  try {
    const { data } = await sb
      .from("operation_killlogs")
      .select("*")
      .eq("operation_id", id)
      .order("created_at", { ascending: false });
    killlogs = data ?? [];
  } catch {
    killlogs = [];
  }

  let mvp: any = null;
  try {
    const { data: votes } = await sb
      .from("operation_mvp_votes")
      .select("voter_discord_id, mvp_card_id, created_at")
      .eq("operation_id", id);

    const counts = new Map<string, number>();
    for (const v of votes ?? []) {
      const rawId = String((v as any)?.mvp_card_id ?? "").trim();
      const cid = effectiveCardId(rawId);
      if (!cid) continue;
      counts.set(cid, (counts.get(cid) ?? 0) + 1);
    }

    const countsArr = [...counts.entries()]
      .map(([marine_card_id, votes]) => ({
        marine_card_id,
        votes,
        display_name: nameForCard(marine_card_id),
      }))
      .sort((a, b) => b.votes - a.votes);

    const participantCardIds = (participantsEnriched ?? [])
      .map((p: any) => String(p?.effective_marine_card_id ?? p?.marine_card_id ?? "").trim())
      .filter(Boolean);

    let eligible = 0;
    if (participantCardIds.length) {
      const { data: memberMap } = await sb
        .from("gm_unit_members")
        .select("discord_id, marine_card_id")
        .in("marine_card_id", participantCardIds);
      eligible = (memberMap ?? []).filter((m: any) => String(m?.discord_id ?? "").trim()).length;
    }

    const opWinnerCardId = effectiveCardId((op as any)?.mvp_card_id);
    mvp = {
      announced_at: (op as any)?.mvp_announced_at ?? null,
      mvp_card_id: opWinnerCardId || ((op as any)?.mvp_card_id ?? null),
      mvp_name: nameForCard((op as any)?.mvp_card_id),
      counts: countsArr,
      eligible,
      voted: new Set((votes ?? []).map((v: any) => String((v as any)?.voter_discord_id ?? "").trim()).filter(Boolean)).size,
      votes: votes ?? [],
    };
  } catch {
    mvp = null;
  }

  return NextResponse.json({
    operation: op,
    participants: participantsEnriched,
    ratings: ratingsEnriched,
    marineRatings: marineRatingsEnriched,
    reports: reportsEnriched,
    killlogs,
    mvp,
  });
}

export async function PUT(req: Request, ctx: { params: { id: string } }) {
  const gate = await requireEditor(req);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const id = String(ctx.params.id ?? "");
  const body = await req.json().catch(() => ({}));

  const patch: any = {};
  const allow = ["title", "planet", "start_at", "end_at", "units", "outcome", "summary", "image_url", "status", "map_grid"];
  for (const k of allow) {
    if (!(k in body)) continue;
    // Normalize datetimes if needed (supports datetime-local)
    if (k === "start_at") {
      try {
        patch.start_at = normalizeDateTime(body.start_at);
      } catch (e: any) {
        return NextResponse.json({ error: "Invalid datetime", details: `start_at ${String(e?.message ?? e)}` }, { status: 400 });
      }
      continue;
    }
    if (k === "end_at") {
      const raw = String(body.end_at ?? "").trim();
      if (!raw) patch.end_at = null;
      else {
        try {
          patch.end_at = normalizeDateTime(raw);
        } catch (e: any) {
          return NextResponse.json({ error: "Invalid datetime", details: `end_at ${String(e?.message ?? e)}` }, { status: 400 });
        }
      }
      continue;
    }
    patch[k] = body[k];
  }

  const participants = Array.isArray(body?.participants) ? body.participants : null;

  const sb = supabaseServer();

  const { data: op, error: upErr } = await sb.from("operations").update(patch).eq("id", id).select("*").single();
  if (upErr)
    return NextResponse.json(
      { error: "Update failed", details: upErr.message, hint: (upErr as any).hint, code: (upErr as any).code },
      { status: 500 }
    );

  if (participants) {
    await sb.from("operation_participants").delete().eq("operation_id", id);

    const rows = participants
      .map((p: any) => ({
        operation_id: id,
        marine_card_id: String(p?.marine_card_id ?? ""),
        role: p?.role ? String(p.role) : null,
        is_lead: !!p?.is_lead,
      }))
      .filter((r: any) => r.marine_card_id);

    if (rows.length) {
      const { error: partErr } = await sb.from("operation_participants").insert(rows);
      if (partErr)
        return NextResponse.json(
          { error: "Participants update failed", details: partErr.message, hint: (partErr as any).hint, code: (partErr as any).code },
          { status: 500 }
        );
    }
  }

  return NextResponse.json({ ok: true, operation: op });
}

export async function DELETE(_: Request, ctx: { params: { id: string } }) {
  const gate = await requireEditor();
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const id = String(ctx.params.id ?? "");
  const sb = supabaseServer();

  await sb.from("operation_participants").delete().eq("operation_id", id);
  await sb.from("operation_ratings").delete().eq("operation_id", id);
  await sb.from("marine_ratings").delete().eq("operation_id", id);
  await sb.from("operation_reports").delete().eq("operation_id", id);

  const { error } = await sb.from("operations").delete().eq("id", id);
  if (error) return NextResponse.json({ error: "Delete failed", details: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
