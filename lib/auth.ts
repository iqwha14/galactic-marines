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
 * Optional RBAC allowlists (Discord user IDs):
 * - ADMIN_DISCORD_IDS   (admin = alles)
 * - EDITOR_DISCORD_IDS  (editor = ops/admin eingeschränkt)
 * - UO_DISCORD_IDS      (UO docs + limited promotions)
 * - FE_DISCORD_IDS      (FE docs + full promotions + training toggles)
 *
 * You may also use the GM_* aliases:
 * - GM_ADMINS, GM_EDITORS, GM_UO_VIEWERS, GM_FE_VIEWERS
 */
function parseIdList(v: string | undefined | null): string[] {
  // Support commas, whitespace, newlines (Vercel UI sometimes adds newlines)
  return String(v ?? "")
    .split(/[,\n\s]+/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

const ADMIN_IDS = [
  ...parseIdList(process.env.ADMIN_DISCORD_IDS),
  ...parseIdList(process.env.GM_ADMINS),
];

const EDITOR_IDS = [
  ...parseIdList(process.env.EDITOR_DISCORD_IDS),
  ...parseIdList(process.env.GM_EDITORS),
];

const UO_IDS = [
  ...parseIdList(process.env.UO_DISCORD_IDS),
  ...parseIdList(process.env.GM_UO_VIEWERS),
];

const FE_IDS = [
  ...parseIdList(process.env.FE_DISCORD_IDS),
  ...parseIdList(process.env.GM_FE_VIEWERS),
];

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
      // Derive Discord ID robustly across first login and subsequent refreshes
      const discordId =
        String((profile as any)?.id ?? "") ||
        String((account as any)?.providerAccountId ?? "") ||
        String((token as any)?.discordId ?? "") ||
        String((token as any)?.sub ?? "");

      if (discordId) {
        (token as any).discordId = discordId;

        const isAdmin = ADMIN_IDS.includes(discordId);
        const isEditor = isAdmin || EDITOR_IDS.includes(discordId);
        const canSeeUO = isAdmin || isEditor || UO_IDS.includes(discordId);
        const canSeeFE = isAdmin || isEditor || FE_IDS.includes(discordId);

        (token as any).isAdmin = isAdmin;
        (token as any).isEditor = isEditor;
        (token as any).canSeeUO = canSeeUO;
        (token as any).canSeeFE = canSeeFE;
      } else {
        (token as any).discordId = null;
        (token as any).isAdmin = false;
        (token as any).isEditor = false;
        (token as any).canSeeUO = false;
        (token as any).canSeeFE = false;
      }
      return token;
    },
    async session({ session, token }) {
      (session as any).discordId = (token as any).discordId ?? null;
      (session as any).isAdmin = !!(token as any).isAdmin;
      (session as any).isEditor = !!(token as any).isEditor;
      (session as any).canSeeUO = !!(token as any).canSeeUO;
      (session as any).canSeeFE = !!(token as any).canSeeFE;
      return session;
    },
  },
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
