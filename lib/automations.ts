import { supabaseAdmin } from "@/lib/supabase";
import { computeNextRunAt } from "@/lib/timezone";
import { sendDiscordWebhookMessage } from "@/lib/discord_automations";

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

  // 1) If a poll is due (and none active), send it.
  const nextPollAt = s.next_poll_at ? new Date(s.next_poll_at) : null;
  const hasActivePoll = !!s.active_poll_created_at;

  if (!hasActivePoll) {
    const due = !nextPollAt || nextPollAt.getTime() <= now.getTime();
    if (due) {
      const pollText = [
        "📁 **Aktenkontrolle**",
        "Wer will freiwillig die Akten kontrollieren?",
        "(Webhook-only: Bitte meldet euch direkt bei der Führung / FE – Reactions werden nicht ausgewertet.)",
        "",
        "⏱ In 3 Stunden wird fair aus dem Pool zugewiesen.",
      ].join("\n");

      try {
        await sendDiscordWebhookMessage({ webhookUrl: s.webhook_url, content: pollText, wait: false });
      } catch {
        // ignore
      }

      const nextWeekly = computeNextRunAt({
        schedule: "weekly",
        timeZone: s.timezone || "Europe/Berlin",
        now,
        timeOfDay: s.time_of_day,
        dayOfWeek: s.day_of_week,
      });

      await sb
        .from("gm_akten_settings")
        .update({
          active_poll_created_at: nowISO,
          next_poll_at: nextWeekly ? nextWeekly.toISOString() : null,
        })
        .eq("id", 1);

      pollsSent++;
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
        const line1 = `📁 **Aktenkontrolle**: **${primary.name}** ist dran.`;
        const line2 = backup ? `Wenn er nicht kann: **${backup.name}**` : "";
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
