import NextAuth, { type NextAuthOptions } from "next-auth";
import DiscordProvider from "next-auth/providers/discord";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * NextAuth v4 (App Router)
 *
 * Required env vars:
 * - NEXTAUTH_URL
 * - NEXTAUTH_SECRET
 * - DISCORD_CLIENT_ID
 * - DISCORD_CLIENT_SECRET
 *
 * Optional DB permissions (takes precedence if present):
 * - SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 *
 * Role allowlists (Discord user IDs; comma/space/newline separated):
 * - ADMIN_DISCORD_IDS   -> Einheitsleitung
 * - FE_DISCORD_IDS      -> FE
 * - UO_DISCORD_IDS      -> UO
 *
 * Compatibility envs (optional):
 * - GM_ADMINS, GM_FE_VIEWERS, GM_UO_VIEWERS
 */
function parseAllowlist(...names: string[]): Set<string> {
  const raw = names.map((n) => process.env[n] ?? "").filter(Boolean).join("\n");
  return new Set(
    raw
      .split(/[\s,\n]+/g)
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

const ADMIN_IDS = parseAllowlist("ADMIN_DISCORD_IDS", "GM_ADMINS");
const FE_IDS = parseAllowlist("FE_DISCORD_IDS", "GM_FE_VIEWERS");
const UO_IDS = parseAllowlist("UO_DISCORD_IDS", "GM_UO_VIEWERS");

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
    return (data ?? null) as DbPerms | null;
  } catch {
    return null;
  }
}

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  providers: [
    DiscordProvider({
      clientId: process.env.DISCORD_CLIENT_ID ?? "",
      clientSecret: process.env.DISCORD_CLIENT_SECRET ?? "",
    }),
  ],
  callbacks: {
    async jwt({ token, account, profile }) {
      const discordId =
        (profile as any)?.id ??
        (token as any)?.discordId ??
        (account as any)?.providerAccountId ??
        (token as any)?.sub ??
        null;

      const id = discordId ? String(discordId) : "";
      (token as any).discordId = id || null;

      if (!id) return token;

      // DB permissions take precedence if present.
      const db = await readDbPerms(id);

      const isAdmin = !!(db?.is_admin ?? false) || ADMIN_IDS.has(id);
      // FE model: admin OR can_see_fe OR is_editor OR env FE list
      const canSeeFE =
        isAdmin ||
        !!(db?.can_see_fe ?? false) ||
        !!(db?.is_editor ?? false) ||
        FE_IDS.has(id);
      // UO model: admin OR FE OR can_see_uo OR env UO list
      const canSeeUO =
        isAdmin ||
        canSeeFE ||
        !!(db?.can_see_uo ?? false) ||
        UO_IDS.has(id);

      // Backward compat for UI/routes that check session.isEditor
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
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
