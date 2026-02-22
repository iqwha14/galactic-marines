type DiscordEmbed = {
  title: string;
  description?: string;
  color?: number;
  fields?: { name: string; value: string; inline?: boolean }[];
  timestamp?: string;
};

function webhookUrl(): string | null {
  const url = (process.env.DISCORD_WEBHOOK_URL ?? "").trim();
  return url ? url : null;
}

async function postEmbeds(embeds: DiscordEmbed[]) {
  const url = webhookUrl();
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds }),
    });
  } catch {
    // Best-effort only (never break the app because Discord is down)
  }
}

function ts(when?: string | Date) {
  if (!when) return new Date().toISOString();
  return typeof when === "string" ? new Date(when).toISOString() : when.toISOString();
}

export async function sendDiscordPromotionEmbed(params: {
  name: string;
  oldRank: string;
  newRank: string;
  direction: "promote" | "demote";
  when?: string | Date;
}) {
  const isPromotion = params.direction === "promote";

  const embed: DiscordEmbed = {
    title: isPromotion ? "⬆️ Beförderung" : "⬇️ Degradierung",
    color: isPromotion ? 0x2ecc71 : 0xf1c40f,
    fields: [
      { name: "Name", value: params.name || "Unbekannt", inline: false },
      { name: "Alter Rang", value: params.oldRank || "Unbekannt", inline: true },
      { name: "Neuer Rang", value: params.newRank || "Unbekannt", inline: true },
    ],
    timestamp: ts(params.when),
  };

  await postEmbeds([embed]);
}

export async function sendDiscordTrainingEmbed(params: {
  action: "completed" | "reverted";
  trainingName: string;
  instructorName: string;
  traineeName: string;
  when?: string | Date;
}) {
  const isCompleted = params.action === "completed";
  const embed: DiscordEmbed = {
    title: isCompleted ? "✅ Fortbildung abgeschlossen" : "↩️ Fortbildung revidiert",
    color: isCompleted ? 0x2ecc71 : 0xe67e22,
    fields: [
      { name: "Name der Fortbildung", value: params.trainingName || "Unbekannt", inline: false },
      { name: isCompleted ? "Ausbilder" : "Von wem", value: params.instructorName || "Unbekannt", inline: true },
      { name: isCompleted ? "Trainee" : "Bei wem", value: params.traineeName || "Unbekannt", inline: true },
    ],
    timestamp: ts(params.when),
  };
  await postEmbeds([embed]);
}

export async function sendDiscordMedalEmbed(params: {
  action: "awarded" | "reverted";
  medalName: string;
  giverName: string;
  receiverName: string;
  when?: string | Date;
}) {
  const isAwarded = params.action === "awarded";
  const embed: DiscordEmbed = {
    title: isAwarded ? "🏅 Medaille verliehen" : "↩️ Medaille revidiert",
    color: isAwarded ? 0x3498db : 0xe67e22,
    fields: [
      { name: "Medaille", value: params.medalName || "Unbekannt", inline: false },
      { name: isAwarded ? "Von" : "Von wem", value: params.giverName || "Unbekannt", inline: true },
      { name: isAwarded ? "An" : "Bei wem", value: params.receiverName || "Unbekannt", inline: true },
    ],
    timestamp: ts(params.when),
  };
  await postEmbeds([embed]);
}