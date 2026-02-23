import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { requireSignedIn } from "@/lib/authz";
import { sendDiscordMvpEmbed } from "@/app/api/_lib/discord";

function isOpOver(op: any): boolean {
  const endRaw = String(op?.end_at ?? "").trim();
  if (!endRaw) return false;
  const end = new Date(endRaw);
  if (Number.isNaN(end.getTime())) return false;
  return end.getTime() <= Date.now();
}

/**
 * MVP Voting
 * POST /api/ops/:id/mvp
 * Body: { mvp_card_id: string }
 * - Only signed-in users
 * - Only participants (must be mapped via gm_unit_members)
 * - Only after operation ended (end_at in past)
 * - One vote per user per operation (upsert)
 *
 * Auto-announce:
 * - Once every eligible participant has voted (based on gm_unit_members mapping)
 * - If there is a clear winner (no tie)
 * - Only once per operation (operations.mvp_announced_at)
 */

export async function POST(req: Request, ctx: { params: { id: string } }) {
  const gate = await requireSignedIn(req);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const operationId = String(ctx.params.id ?? "").trim();
  if (!operationId) return NextResponse.json({ error: "Missing operation id" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const mvpCardId = String(body?.mvp_card_id ?? "").trim();
  if (!mvpCardId) return NextResponse.json({ error: "Missing mvp_card_id" }, { status: 400 });

  const sb = supabaseServer();

  // Load operation + participants
  const { data: op, error: opErr } = await sb.from("operations").select("*").eq("id", operationId).single();
  if (opErr || !op) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!isOpOver(op)) {
    return NextResponse.json({ error: "MVP-Wahl ist erst nach Einsatzende möglich." }, { status: 400 });
  }

  const { data: participants } = await sb
    .from("operation_participants")
    .select("marine_card_id")
    .eq("operation_id", operationId);

  const participantCardIds = (participants ?? []).map((p: any) => String(p?.marine_card_id ?? "").trim()).filter(Boolean);
  if (!participantCardIds.length) {
    return NextResponse.json({ error: "Keine Teilnehmer im Einsatz." }, { status: 400 });
  }

  if (!participantCardIds.includes(mvpCardId)) {
    return NextResponse.json({ error: "MVP muss Teilnehmer dieses Einsatzes sein." }, { status: 400 });
  }

  // Resolve voter's own unit member card id (must exist)
  const voterDiscordId = String(gate.session?.discordId ?? "").trim();
  const { data: me, error: meErr } = await sb
    .from("gm_unit_members")
    .select("marine_card_id, display_name")
    .eq("discord_id", voterDiscordId)
    .single();

  if (meErr || !me?.marine_card_id) {
    return NextResponse.json({ error: "Du bist nicht als Einheit-Mitglied hinterlegt (gm_unit_members)." }, { status: 403 });
  }

  const myCardId = String((me as any).marine_card_id ?? "").trim();
  if (!participantCardIds.includes(myCardId)) {
    return NextResponse.json({ error: "Nur Teilnehmer des Einsatzes dürfen abstimmen." }, { status: 403 });
  }

  if (myCardId === mvpCardId) {
    return NextResponse.json({ error: "Du kannst nicht für dich selbst abstimmen." }, { status: 400 });
  }

  // Record vote (one per voter)
  const { error: voteErr } = await sb
    .from("operation_mvp_votes")
    .upsert(
      {
        operation_id: operationId,
        voter_discord_id: voterDiscordId,
        mvp_card_id: mvpCardId,
      },
      { onConflict: "operation_id,voter_discord_id" }
    );

  if (voteErr) {
    return NextResponse.json(
      { error: "Vote failed", details: voteErr.message, hint: (voteErr as any).hint, code: (voteErr as any).code },
      { status: 500 }
    );
  }

  // Auto-announce if complete and not announced yet
  try {
    // Determine eligible voters: participants with a discord_id mapping
    const { data: memberMap } = await sb
      .from("gm_unit_members")
      .select("discord_id, marine_card_id, display_name")
      .in("marine_card_id", participantCardIds);

    const eligibleDiscordIds = (memberMap ?? [])
      .map((m: any) => String(m?.discord_id ?? "").trim())
      .filter(Boolean);

    // No eligible voters -> nothing to announce
    if (!eligibleDiscordIds.length) {
      return NextResponse.json({ success: true });
    }

    const { data: votes } = await sb
      .from("operation_mvp_votes")
      .select("voter_discord_id, mvp_card_id")
      .eq("operation_id", operationId);

    const votedBy = new Set(
      (votes ?? []).map((v: any) => String(v?.voter_discord_id ?? "").trim()).filter(Boolean)
    );

    const complete = eligibleDiscordIds.every((id) => votedBy.has(id));
    if (!complete) {
      return NextResponse.json({ success: true, pending: true, voted: votedBy.size, eligible: eligibleDiscordIds.length });
    }

    // Already announced?
    const alreadyAnnounced = !!String((op as any)?.mvp_announced_at ?? "").trim();
    if (alreadyAnnounced) {
      return NextResponse.json({ success: true, announced: true });
    }

    // Count votes
    const counts = new Map<string, number>();
    for (const v of votes ?? []) {
      const cid = String((v as any)?.mvp_card_id ?? "").trim();
      if (!cid) continue;
      counts.set(cid, (counts.get(cid) ?? 0) + 1);
    }

    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    if (!sorted.length) {
      return NextResponse.json({ success: true, announced: false });
    }

    const [winnerId, winnerVotes] = sorted[0];
    const secondVotes = sorted[1]?.[1] ?? 0;
    if (winnerVotes === secondVotes) {
      // Tie -> no auto announce
      return NextResponse.json({ success: true, tie: true, announced: false });
    }

    const displayNameByCard = new Map<string, string>();
    for (const m of memberMap ?? []) {
      const cid = String((m as any)?.marine_card_id ?? "").trim();
      const dn = String((m as any)?.display_name ?? "").trim();
      if (cid && dn) displayNameByCard.set(cid, dn);
    }

    // Trello fallback name (best-effort)
    let winnerName = displayNameByCard.get(winnerId) ?? "";
    if (!winnerName) {
      try {
        const { requiredEnv, trelloBaseParams } = await import("@/app/api/_lib/trello");
        const boardId = requiredEnv("TRELLO_BOARD_ID");
        const { key, token } = trelloBaseParams();
        const url = new URL(`https://api.trello.com/1/cards/${winnerId}`);
        url.searchParams.set("key", key);
        url.searchParams.set("token", token);
        url.searchParams.set("fields", "name");
        const res = await fetch(url.toString(), { next: { revalidate: 60 } });
        if (res.ok) {
          const j = (await res.json()) as any;
          winnerName = String(j?.name ?? "").trim();
        }
      } catch {
        winnerName = "";
      }
    }
    if (!winnerName) winnerName = winnerId;

    // Persist result + mark announced
    await sb
      .from("operations")
      .update({ mvp_card_id: winnerId, mvp_announced_at: new Date().toISOString() })
      .eq("id", operationId);

    await sendDiscordMvpEmbed({
      operationTitle: String((op as any)?.title ?? "Einsatz"),
      operationId,
      mvpName: winnerName,
      votes: winnerVotes,
      totalVotes: eligibleDiscordIds.length,
    });

    return NextResponse.json({ success: true, announced: true, winner: { mvp_card_id: winnerId, votes: winnerVotes } });
  } catch {
    // Best-effort announcement must not block vote.
    return NextResponse.json({ success: true });
  }
}
