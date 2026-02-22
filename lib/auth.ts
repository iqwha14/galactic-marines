import NextAuth, { type NextAuthOptions } from "next-auth";
import DiscordProvider from "next-auth/providers/discord";

/**
 * NextAuth v4 (App Router)
 *
 * Required env vars:
 * - NEXTAUTH_URL
 * - NEXTAUTH_SECRET
 * - DISCORD_CLIENT_ID
 * - DISCORD_CLIENT_SECRET
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

      const isAdmin = id ? ADMIN_IDS.has(id) : false;
      const canSeeFE = id ? (isAdmin || FE_IDS.has(id)) : false;
      const canSeeUO = id ? (isAdmin || canSeeFE || UO_IDS.has(id)) : false;

      (token as any).isAdmin = isAdmin;
      (token as any).canSeeFE = canSeeFE;
      (token as any).canSeeUO = canSeeUO;

      return token;
    },
    async session({ session, token }) {
      (session as any).discordId = (token as any).discordId ?? null;
      (session as any).isAdmin = !!(token as any).isAdmin;
      (session as any).canSeeFE = !!(token as any).canSeeFE;
      (session as any).canSeeUO = !!(token as any).canSeeUO;
      return session;
    },
  },
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
