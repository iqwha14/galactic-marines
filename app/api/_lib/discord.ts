export async function sendDiscordPromotionEmbed(params: {
  discordUser?: string;
  name: string;
  oldRank: string;
  newRank: string;
}) {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) return;

  const isPromotion = params.newRank !== params.oldRank;

  const embed = {
    title: isPromotion ? "⬆️ Mitglied befördert" : "⬇️ Mitglied degradiert",
    color: isPromotion ? 0x2ecc71 : 0xf1c40f,
    fields: [
      {
        name: "Discord-Nutzer",
        value: params.discordUser ?? "Unbekannt",
        inline: false,
      },
      {
        name: "Name",
        value: params.name,
        inline: false,
      },
      {
        name: "Alter Rang",
        value: params.oldRank,
        inline: true,
      },
      {
        name: "Neuer Rang",
        value: params.newRank,
        inline: true,
      },
    ],
    timestamp: new Date().toISOString(),
  };

  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      embeds: [embed],
    }),
  });
}