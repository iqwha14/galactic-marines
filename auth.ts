import NextAuth from "next-auth";
import Discord from "next-auth/providers/discord";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * Discord Role Allow-Lists (Discord User IDs, comma-separated)
 * - EDITOR_DISCORD_IDS="123,456"
 * - UO_DISCORD_IDS="123,789"
 */
function parseAllowList(envName: string): Set<string> {
  const raw = (process.env[envName] ?? "").trim();
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

const EDITOR_IDS = parseAllowList("EDITOR_DISCORD_IDS");
const UO_IDS = parseAllowList("UO_DISCORD_IDS");
const ADMIN_IDS = parseAllowList("ADMIN_DISCORD_IDS");


type DbPerms = {
  display_name?: string | null;
  is_admin?: boolean | null;
  is_editor?: boolean | null;
  can_see_uo?: boolean | null;
  can_see_fe?: boolean | null;
};

async function fetchDbPerms(discordId: string): Promise<DbPerms | null> {
  try {
    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from("gm_user_permissions")
      .select("display_name,is_admin,is_editor,can_see_uo,can_see_fe")
      .eq("discord_id", discordId)
      .maybeSingle();
    if (error) return null;
    return data ?? null;
  } catch {
    return null;
  }
}

export const { handlers, auth } = NextAuth({
  providers: [
    Discord({
      clientId: process.env.DISCORD_CLIENT_ID!,
      clientSecret: process.env.DISCORD_CLIENT_SECRET!,
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, profile }) {
      const discordId = (profile as any)?.id ?? (token as any)?.discordId;
      if (discordId) (token as any).discordId = String(discordId);

      const id = String((token as any).discordId ?? "");
      const db = id ? await fetchDbPerms(id) : null;

const isAdmin = (db?.is_admin ?? false) || ADMIN_IDS.has(id);
const isEditor = isAdmin || (db?.is_editor ?? false) || EDITOR_IDS.has(id);
const canSeeUO = isAdmin || (db?.can_see_uo ?? false) || UO_IDS.has(id);
const canSeeFE = isAdmin || (db?.can_see_fe ?? false);

(token as any).isAdmin = isAdmin;
(token as any).isEditor = isEditor;
(token as any).canSeeUO = canSeeUO;
(token as any).canSeeFE = canSeeFE;
if (db?.display_name) (token as any).displayName = db.display_name;

return token;
    },
    async session({ session, token }) {
      (session as any).discordId = (token as any).discordId ?? null;
(session as any).isAdmin = !!(token as any).isAdmin;
(session as any).isEditor = !!(token as any).isEditor;
(session as any).canSeeUO = !!(token as any).canSeeUO;
(session as any).canSeeFE = !!(token as any).canSeeFE;
if ((token as any).displayName) {
  session.user = session.user ?? {};
  (session.user as any).name = (token as any).displayName;
}
return session;
    },
  },
});
