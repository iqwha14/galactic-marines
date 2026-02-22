/**
 * Discord Webhook helper (Embeds)
 *
 * Webhooks:
 *  - DISCORD_WEBHOOK_URL: Promotions/Degradierungen
 *  - DISCORD_WEBHOOK_TRAINING_URL: Fortbildungen & Medaillen
 *
 * If a webhook URL is not set, corresponding functions are no-ops.
 */

type EmbedField = { name: string; value: string; inline?: boolean };

type Embed = {
  title: string;
  description?: string;
  color?: number;
  fields?: EmbedField[];
  timestamp?: string;
};

async function postEmbedsTo(url: string | undefined, embeds: Embed[]) {
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds }),
    });
  } catch {
    // Best-effort: webhook failures must never block core actions
  }
}

function isoNow() {
  return new Date().toISOString();
}

function safe(v: any, fallback = "Unbekannt") {
  const s = String(v ?? "").trim();
  return s ? s : fallback;
}

export async function sendDiscordPromotionEmbed(params: {
  kind: "promotion" | "demotion";
  name: string;
  oldRank: string;
  newRank: string;
  actor?: string; // who clicked
  timestamp?: string; // optional ISO
}) {
  const isPromotion = params.kind === "promotion";

  const embed: Embed = {
    title: isPromotion ? "⬆️ Beförderung" : "⬇️ Degradierung",
    color: isPromotion ? 0x2ecc71 : 0xe74c3c,
    fields: [
      { name: "Name", value: safe(params.name), inline: false },
      { name: "Alter Rang", value: safe(params.oldRank), inline: true },
      { name: "Neuer Rang", value: safe(params.newRank), inline: true },
    ],
    timestamp: params.timestamp ?? isoNow(),
  };

  if (params.actor) {
    embed.fields = [{ name: "Von", value: safe(params.actor), inline: false }, ...(embed.fields ?? [])];
  }

  await postEmbedsTo(process.env.DISCORD_WEBHOOK_URL, [embed]);
}

export async function sendDiscordTrainingEmbed(params: {
  action: "completed" | "reverted";
  trainingName: string;
  instructor: string; // actor
  trainee: string; // card name
  timestamp?: string;
}) {
  const completed = params.action === "completed";
  const embed: Embed = {
    title: completed ? "✅ Fortbildung abgeschlossen" : "↩️ Fortbildung revidiert",
    color: completed ? 0x3498db : 0xf1c40f,
    fields: [
      { name: "Name der Fortbildung", value: safe(params.trainingName), inline: false },
      { name: completed ? "Ausbilder" : "Von wem", value: safe(params.instructor), inline: true },
      { name: completed ? "Trainee" : "Bei wem", value: safe(params.trainee), inline: true },
    ],
    timestamp: params.timestamp ?? isoNow(),
  };

  await postEmbedsTo(process.env.DISCORD_WEBHOOK_TRAINING_URL, [embed]);
}

export async function sendDiscordMedalEmbed(params: {
  action: "awarded" | "revoked";
  medalName: string;
  actor: string;
  recipient: string;
  timestamp?: string;
}) {
  const awarded = params.action === "awarded";
  const embed: Embed = {
    title: awarded ? "🏅 Medaille verliehen" : "↩️ Medaille revidiert",
    color: awarded ? 0x9b59b6 : 0xf1c40f,
    fields: [
      { name: "Medaille", value: safe(params.medalName), inline: false },
      { name: "Von wem", value: safe(params.actor), inline: true },
      { name: awarded ? "An" : "Bei wem", value: safe(params.recipient), inline: true },
    ],
    timestamp: params.timestamp ?? isoNow(),
  };

  await postEmbedsTo(process.env.DISCORD_WEBHOOK_TRAINING_URL, [embed]);
}
