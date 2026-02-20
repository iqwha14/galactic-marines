import { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

/**
 * This file exists ONLY to satisfy imports like:
 *   import { requireEditor } from "../../../../_lib/authz";
 *
 * Requires NEXTAUTH_SECRET on Vercel.
 * Optional allowlists (comma-separated Discord IDs):
 * - EDITOR_DISCORD_IDS
 * - UO_DISCORD_IDS
 *
 * If the allowlist env var is missing/empty -> any signed-in user is allowed.
 */

function parseCsv(name: string): Set<string> {
  const raw = process.env[name] ?? "";
  return new Set(raw.split(",").map(s => s.trim()).filter(Boolean));
}

const EDITORS = parseCsv("EDITOR_DISCORD_IDS");
const UO = parseCsv("UO_DISCORD_IDS");

async function getDiscordId(req: NextRequest): Promise<string | null> {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) return null;
  const t: any = token as any;
  return (t.discordId || t.providerAccountId || t.sub || t.id || null) as string | null;
}

export async function requireSignedIn(req: NextRequest) {
  const discordId = await getDiscordId(req);
  if (!discordId) throw new Error("Not signed in");
  return { discordId };
}

export async function requireEditor(req: NextRequest) {
  const { discordId } = await requireSignedIn(req);
  if (EDITORS.size > 0 && !EDITORS.has(String(discordId))) throw new Error("Editor access denied");
  return { discordId };
}

export async function requireUO(req: NextRequest) {
  const { discordId } = await requireSignedIn(req);
  if (UO.size > 0 && !UO.has(String(discordId))) throw new Error("UO access denied");
  return { discordId };
}
