/**
 * Discord Webhook helper (Embeds)
 *
 * If DISCORD_WEBHOOK_URL is not set, functions are no-ops.
 */

type EmbedField = { name: string; value: string; inline?: boolean };

type Embed = {
  title: string;
  description?: string;
  color?: number;
  fields?: EmbedField[];
  timestamp?: string;
};

async function postEmbeds(embeds: Embed[]) {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) return;

  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds }),
    });
  } catch {
    // intentionally swallow webhook failures; core actions must still succeed
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
  name: string;
  oldRank: string;
  newRank: string;
  actor?: string; // who clicked
}) {
  const isPromotion = params.newRank !== params.oldRank;

  const embed: Embed = {
    title: isPromotion ? "⬆️ Beförderung" : "⬇️ Degradierung",
    color: isPromotion ? 0x2ecc71 : 0xe74c3c,
    fields: [
      { name: "Name", value: safe(params.name), inline: false },
      { name: "Alter Rang", value: safe(params.oldRank), inline: true },
      { name: "Neuer Rang", value: safe(params.newRank), inline: true },
    ],
    timestamp: isoNow(),
  };

  if (params.actor) {
    embed.fields = [{ name: "Von", value: safe(params.actor), inline: false }, ...(embed.fields ?? [])];
  }

  await postEmbeds([embed]);
}

export async function sendDiscordTrainingEmbed(params: {
  action: "completed" | "reverted";
  trainingName: string;
  instructor: string; // actor
  trainee: string; // card name
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
    timestamp: isoNow(),
  };

  await postEmbeds([embed]);
}

export async function sendDiscordMedalEmbed(params: {
  action: "awarded" | "revoked";
  medalName: string;
  actor: string;
  recipient: string;
}) {
  const awarded = params.action === "awarded";
  const embed: Embed = {
    title: awarded ? "🏅 Medaille verliehen" : "↩️ Medaille revidiert",
    color: awarded ? 0x9b59b6 : 0xf1c40f,
    fields: [
      { name: "Medaille", value: safe(params.medalName), inline: false },
      { name: awarded ? "Von wem" : "Von wem", value: safe(params.actor), inline: true },
      { name: awarded ? "An" : "Bei wem", value: safe(params.recipient), inline: true },
    ],
    timestamp: isoNow(),
  };

  await postEmbeds([embed]);
}
