type DiscordMessage = {
  id: string;
  channel_id?: string;
  content?: string;
};

export async function sendDiscordWebhookMessage(params: {
  webhookUrl: string;
  content: string;
  wait?: boolean;
}): Promise<DiscordMessage | null> {
  const url = String(params.webhookUrl || "").trim();
  if (!url) return null;
  const wait = params.wait !== false;
  const u = wait ? (url.includes("?") ? `${url}&wait=true` : `${url}?wait=true`) : url;

  const res = await fetch(u, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: params.content, allowed_mentions: { parse: ["users","roles"] } }),
  });

  if (!wait) return null;
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Discord webhook failed: ${res.status} ${txt}`);
  }
  const data = (await res.json().catch(() => null)) as any;
  if (!data?.id) return null;
  return { id: String(data.id), channel_id: data.channel_id ? String(data.channel_id) : undefined, content: data.content };
}
