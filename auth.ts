import NextAuth from "next-auth";
import Discord from "next-auth/providers/discord";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * Discord Role Allow-Lists (Discord User IDs, comma-separated)
 * Optional (DB in gm_user_permissions takes precedence if present):
 * - ADMIN_DISCORD_IDS="123,456"
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

const ADMIN_IDS = parseAllowList("ADMIN_DISCORD_IDS");
const EDITOR_IDS = parseAllowList("EDITOR_DISCORD_IDS");
const UO_IDS = parseAllowList("UO_DISCORD_IDS");

type DbPerms = {
  is_admin?: boolean | null;
  can_see_fe?: boolean | null;
  can_see_uo?: boolean | null;
  is_editor?: boolean | null;
};

async function readDbPerms(discordId: string): Promise<DbPerms | null> {
  // If Supabase env vars are missing, fall back to allowlists.
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  try {
    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from("gm_user_permissions")
      .select("is_admin, can_see_fe, can_see_uo, is_editor")
      .eq("discord_id", discordId)
      .maybeSingle();
    if (error) return null;
    return (data ?? null) as any;
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
      const discordId = String((profile as any)?.id ?? (token as any)?.discordId ?? "");
      if (discordId) (token as any).discordId = discordId;

      const id = String((token as any).discordId ?? "");
      if (!id) return token;

      const db = await readDbPerms(id);

      const isAdmin = !!(db?.is_admin ?? false) || ADMIN_IDS.has(id);
      const canSeeFE = isAdmin || !!(db?.can_see_fe ?? false) || !!(db?.is_editor ?? false) || EDITOR_IDS.has(id);
      const canSeeUO = isAdmin || canSeeFE || !!(db?.can_see_uo ?? false) || UO_IDS.has(id);

      // Backward compat for UI (it checks session.isEditor)
      const isEditor = canSeeFE;

      (token as any).isAdmin = isAdmin;
      (token as any).canSeeFE = canSeeFE;
      (token as any).canSeeUO = canSeeUO;
      (token as any).isEditor = isEditor;

      return token;
    },
    async session({ session, token }) {
      (session as any).discordId = (token as any).discordId ?? null;
      (session as any).isAdmin = !!(token as any).isAdmin;
      (session as any).canSeeFE = !!(token as any).canSeeFE;
      (session as any).canSeeUO = !!(token as any).canSeeUO;
      (session as any).isEditor = !!(token as any).isEditor;
      return session;
    },
  },
});
