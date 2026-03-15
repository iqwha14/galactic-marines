import { supabaseAdmin } from "@/lib/supabase";
import { computeNextRunAt } from "@/lib/timezone";
import { sendDiscordWebhookMessage } from "@/lib/discord_automations";
import { sendDiscordMvpEmbed, sendDiscordNoMvpEmbed } from "@/app/api/_lib/discord";

type PlannedMessageRow = {
  id: string;
  enabled: boolean;
  webhook_url: string;
  content: string;
  schedule: "once" | "daily" | "weekly";
  run_at: string | null;
  time_of_day: string | null;
  day_of_week: number | null;
  timezone: string;
  next_run_at: string | null;
  last_run_at: string | null;
};

type AktenSettingsRow = {
  id: number;
  enabled: boolean;
  webhook_url: string;
  timezone: string;
  day_of_week: number;
  time_of_day: string;
  followup_delay_minutes: number;
  next_poll_at: string | null;
  active_poll_created_at: string | null;
};

type AktenPoolRow = {
  name: string; // stable key, e.g. 'user:123' or 'role:456'
  mention_type: "user" | "role";
  mention_id: string | null;
  label: string | null;
  times_assigned: number;
  last_assigned_at: string | null;
};

function nowIso(d = new Date()): string {
  return d.toISOString();
}


type MentionTarget = Pick<AktenPoolRow, "mention_type" | "mention_id" | "label" | "name">;

function mentionOf(t: MentionTarget): string {
  const id = String(t.mention_id ?? "").trim();
  if (id) return t.mention_type === "role" ? `<@&${id}>` : `<@${id}>`;
  // Fallback: show label or key if IDs are missing
  return String(t.label ?? t.name ?? "Unbekannt");
}


/**
 * Webhook-only automations:
 * - Planned Messages: scheduled webhook sends
 * - Aktenkontrolle: weekly poll message + 3h later fair assignment from pool
 *
 * NOTE: With only a webhook URL we cannot read reactions or determine volunteers.
 */
export async function runDiscordAutomations(): Promise<{
  ok: true;
  planned: { sent: number; touched: number };
  akten: { pollsSent: number; followupsProcessed: number };
  warnings: string[];
}> {
  const warnings: string[] = [];

  const planned = await processPlannedMessages().catch((e: any) => {
    warnings.push(`planned_messages: ${e?.message ?? String(e)}`);
    return { sent: 0, touched: 0 };
  });

  const akten = await processAktenkontrolle().catch((e: any) => {
    warnings.push(`aktenkontrolle: ${e?.message ?? String(e)}`);
    return { pollsSent: 0, followupsProcessed: 0 };
  });

  await processOperationMvpFinalization().catch((e: any) => {
    warnings.push(`mvp_finalization: ${e?.message ?? String(e)}`);
  });

  return { ok: true, planned, akten, warnings };
}

async function processPlannedMessages(): Promise<{ sent: number; touched: number }> {
  const sb = supabaseAdmin();
  const now = new Date();
  const nowISO = nowIso(now);

  const { data, error } = await sb
    .from("gm_planned_messages")
    .select("*")
    .eq("enabled", true)
    .not("next_run_at", "is", null)
    .lte("next_run_at", nowISO)
    .order("next_run_at", { ascending: true })
    .limit(50);

  if (error) {
    // Table might not exist yet.
    return { sent: 0, touched: 0 };
  }

  const rows = (data ?? []) as PlannedMessageRow[];
  let sent = 0;
  let touched = 0;

  for (const r of rows) {
    // send message (best-effort)
    try {
      await sendDiscordWebhookMessage({ webhookUrl: r.webhook_url, content: r.content, wait: false });
      sent++;
    } catch {
      // don't break other jobs
    }

    const next = computeNextRunAt({
      schedule: r.schedule,
      timeZone: r.timezone || "Europe/Berlin",
      now,
      runAt: r.run_at,
      timeOfDay: r.time_of_day,
      dayOfWeek: r.day_of_week,
    });

    let nextRunAt: string | null = null;
    let enabled = r.enabled;
    if (r.schedule === "once") {
      enabled = false;
      nextRunAt = null;
    } else {
      nextRunAt = next ? next.toISOString() : null;
    }

    await sb
      .from("gm_planned_messages")
      .update({
        enabled,
        last_run_at: nowISO,
        next_run_at: nextRunAt,
      })
      .eq("id", r.id);

    touched++;
  }

  return { sent, touched };
}

async function processAktenkontrolle(): Promise<{ pollsSent: number; followupsProcessed: number }> {
  const sb = supabaseAdmin();
  const now = new Date();
  const nowISO = nowIso(now);

  const { data: settingsData, error: settingsErr } = await sb.from("gm_akten_settings").select("*").eq("id", 1).single();
  if (settingsErr || !settingsData) return { pollsSent: 0, followupsProcessed: 0 };

  const s = settingsData as AktenSettingsRow;
  if (!s.enabled) return { pollsSent: 0, followupsProcessed: 0 };
  if (!String(s.webhook_url || "").trim()) return { pollsSent: 0, followupsProcessed: 0 };

  let pollsSent = 0;
  let followupsProcessed = 0;

  // Optional: ping a role for visibility (keeps DB schema unchanged).
  // Set GM_AKTEN_PING_ROLE_ID="123..." in your environment to enable.
  const pingRoleId = String(process.env.GM_AKTEN_PING_ROLE_ID ?? "").trim();
  const pingRole = pingRoleId ? `<@&${pingRoleId}>` : "";

  // 1) If a poll is due (and none active), send it.
  const nextPollAt = s.next_poll_at ? new Date(s.next_poll_at) : null;
  const hasActivePoll = !!s.active_poll_created_at;

  if (!hasActivePoll) {
    const due = !nextPollAt || nextPollAt.getTime() <= now.getTime();
    if (due) {
      const nextWeekly = computeNextRunAt({
        schedule: "weekly",
        timeZone: s.timezone || "Europe/Berlin",
        now,
        timeOfDay: s.time_of_day,
        dayOfWeek: s.day_of_week,
      });

      // IMPORTANT: Prevent duplicate poll sends on concurrent cron runs.
      // Claim the poll slot atomically first; only the winner sends the message.
      const { data: claimed, error: claimErr } = await sb
        .from("gm_akten_settings")
        .update({
          active_poll_created_at: nowISO,
          next_poll_at: nextWeekly ? nextWeekly.toISOString() : null,
        })
        .eq("id", 1)
        .is("active_poll_created_at", null)
        // If next_poll_at is null OR due, allow claim. (We already checked due, this is a safety net.)
        .or(`next_poll_at.is.null,next_poll_at.lte.${nowISO}`)
        .select("active_poll_created_at")
        .maybeSingle();

      if (!claimErr && claimed?.active_poll_created_at) {
        const pollText = [
          pingRole,
          "📁 **Aktenkontrolle**",
          "Wer will freiwillig die Akten kontrollieren?",
          "(Bitte meldet euch direkt im FE Chat – Reactions werden nicht ausgewertet.)",
          "",
          "⏱ In 3 Stunden wird fair aus dem Pool zugewiesen.",
        ]
          .filter(Boolean)
          .join("\n");

        try {
          await sendDiscordWebhookMessage({ webhookUrl: s.webhook_url, content: pollText, wait: false });
        } catch {
          // ignore
        }

        pollsSent++;
      }
    }
  }

  // 2) Follow-up: if poll exists and created_at+delay <= now, finalize.
  if (s.active_poll_created_at) {
    const created = new Date(s.active_poll_created_at);
    const dueAt = new Date(created.getTime() + Math.max(1, s.followup_delay_minutes) * 60_000);

    if (dueAt.getTime() <= now.getTime()) {
      const { data: poolData } = await sb.from("gm_akten_pool").select("*");
      const pool = (poolData ?? []) as AktenPoolRow[];

      pool.sort((a, b) => {
        const ta = Number(a.times_assigned ?? 0);
        const tb = Number(b.times_assigned ?? 0);
        if (ta !== tb) return ta - tb;
        const la = a.last_assigned_at ? new Date(a.last_assigned_at).getTime() : 0;
        const lb = b.last_assigned_at ? new Date(b.last_assigned_at).getTime() : 0;
        return la - lb;
      });

      const primary = pool.length > 0 ? pool[0] : null;
      const backup = pool.length > 1 ? pool[1] : null;

      if (primary) {
        const primaryLabel = String(primary.label ?? primary.name);
        const backupLabel = backup ? String(backup.label ?? backup.name) : null;
        const line1 = `📁 **Aktenkontrolle**: ${mentionOf(primary)} ist dran. (${primaryLabel})`;
        const line2 = backup ? `Wenn er nicht kann: ${mentionOf(backup)} (${backupLabel})` : "";
        const text = [line1, line2].filter(Boolean).join("\n");

        try {
          await sendDiscordWebhookMessage({ webhookUrl: s.webhook_url, content: text, wait: false });
        } catch {
          // ignore
        }

        // Update fairness stats
        await sb
          .from("gm_akten_pool")
          .update({
            times_assigned: Number(primary.times_assigned ?? 0) + 1,
            last_assigned_at: nowISO,
          })
          .eq("name", primary.name);

        await sb.from("gm_akten_history").insert({
          mode: "auto",
          chosen_primary_name: String(primary.label ?? primary.name),
          chosen_backup_name: backup ? String(backup.label ?? backup.name) : null,
          poll_created_at: s.active_poll_created_at,
        });
      } else {
        try {
          await sendDiscordWebhookMessage({
            webhookUrl: s.webhook_url,
            content: "📁 **Aktenkontrolle**: Pool ist leer. Bitte Pool im Admin Panel pflegen.",
            wait: false,
          });
        } catch {
          // ignore
        }

        await sb.from("gm_akten_history").insert({
          mode: "auto",
          chosen_primary_name: null,
          chosen_backup_name: null,
          poll_created_at: s.active_poll_created_at,
        });
      }

      // Clear active poll
      await sb.from("gm_akten_settings").update({ active_poll_created_at: null }).eq("id", 1);

      followupsProcessed++;
    }
  }

  return { pollsSent, followupsProcessed };
}

function isEndedStatus(status: unknown): boolean {
  const s = String(status ?? "").trim().toLowerCase();
  return ["beendet", "ended", "completed", "complete", "finished", "done", "abgeschlossen"].includes(s);
}

function nameFromMember(m: any): string {
  const display = String(m?.display_name ?? "").trim();
  if (display) return display;
  const name = String(m?.name ?? "").trim();
  if (name) return name;
  return "";
}

async function resolveWinnerNameForAutomation(
  sb: ReturnType<typeof supabaseAdmin>,
  winnerId: string,
  displayNameByCard: Map<string, string>
) {
  const mapped = String(displayNameByCard.get(winnerId) ?? "").trim();
  if (mapped) return mapped;
  try {
    const { data: member } = await sb
      .from("gm_unit_members")
      .select("display_name, name")
      .eq("marine_card_id", winnerId)
      .maybeSingle();
    const direct = nameFromMember(member ?? null);
    if (direct) return direct;
  } catch {
    // ignore
  }
  return winnerId;
}

async function processOperationMvpFinalization(): Promise<void> {
  const sb = supabaseAdmin();
  const now = new Date();
  const nowIso = now.toISOString();

  const { data: ops, error } = await sb
    .from("operations")
    .select("id, title, end_at, status, mvp_card_id, mvp_announced_at")
    .is("mvp_announced_at", null)
    .limit(100);

  if (error || !ops?.length) return;

  for (const op of ops) {
    const opId = String((op as any)?.id ?? "").trim();
    if (!opId) continue;

    const endRaw = String((op as any)?.end_at ?? "").trim();
    const endAt = endRaw ? new Date(endRaw) : null;
    const hasValidEndAt = !!endAt && !Number.isNaN(endAt.getTime());
    const endedByTime = !!hasValidEndAt && endAt!.getTime() <= now.getTime();
    const ended = endedByTime || isEndedStatus((op as any)?.status);
    if (!ended) continue;

    const oneHourPassed = !!hasValidEndAt && now.getTime() >= endAt!.getTime() + 60 * 60 * 1000;

    const { data: participants } = await sb
      .from("operation_participants")
      .select("marine_card_id")
      .eq("operation_id", opId);

    const participantCardIds = (participants ?? [])
      .map((p: any) => String(p?.marine_card_id ?? "").trim())
      .filter(Boolean);
    if (!participantCardIds.length) continue;

    const { data: members } = await sb
      .from("gm_unit_members")
      .select("discord_id, marine_card_id, display_name, name")
      .in("marine_card_id", participantCardIds);

    const eligibleDiscordIds = new Set<string>();
    const displayNameByCard = new Map<string, string>();
    for (const member of members ?? []) {
      const did = String((member as any)?.discord_id ?? "").trim();
      const cid = String((member as any)?.marine_card_id ?? "").trim();
      const name = nameFromMember(member);
      if (did) eligibleDiscordIds.add(did);
      if (cid && name) displayNameByCard.set(cid, name);
    }

    const { data: votes } = await sb
      .from("operation_mvp_votes")
      .select("voter_discord_id, mvp_card_id")
      .eq("operation_id", opId);

    const votedBy = new Set(
      (votes ?? []).map((v: any) => String(v?.voter_discord_id ?? "").trim()).filter(Boolean)
    );
    const allVoted = eligibleDiscordIds.size > 0 && [...eligibleDiscordIds].every((id) => votedBy.has(id));

    if (!allVoted && !oneHourPassed) continue;

    const counts = new Map<string, number>();
    for (const vote of votes ?? []) {
      const cid = String((vote as any)?.mvp_card_id ?? "").trim();
      if (!cid) continue;
      counts.set(cid, (counts.get(cid) ?? 0) + 1);
    }

    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const title = String((op as any)?.title ?? "Einsatz");

    if (!sorted.length) {
      await sb.from("operations").update({ mvp_card_id: null, mvp_announced_at: nowIso }).eq("id", opId).is("mvp_announced_at", null);
      await sendDiscordNoMvpEmbed({ operationTitle: title, operationId: opId, timestamp: nowIso });
      continue;
    }

    const [winnerId, winnerVotes] = sorted[0];
    const secondVotes = sorted[1]?.[1] ?? 0;

    if (winnerVotes === secondVotes) {
      await sb.from("operations").update({ mvp_card_id: null, mvp_announced_at: nowIso }).eq("id", opId).is("mvp_announced_at", null);
      await sendDiscordNoMvpEmbed({ operationTitle: title, operationId: opId, timestamp: nowIso });
      continue;
    }

    const winnerName = await resolveWinnerNameForAutomation(sb, winnerId, displayNameByCard);
    await sb.from("operations").update({ mvp_card_id: winnerId, mvp_announced_at: nowIso }).eq("id", opId).is("mvp_announced_at", null);
    await sendDiscordMvpEmbed({
      operationTitle: title,
      operationId: opId,
      mvpName: winnerName,
      votes: winnerVotes,
      totalVotes: Math.max(eligibleDiscordIds.size, votedBy.size),
      timestamp: nowIso,
    });
  }
}
