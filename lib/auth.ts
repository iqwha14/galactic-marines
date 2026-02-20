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
 * Optional RBAC allowlists (comma-separated Discord user IDs):
 * - EDITOR_DISCORD_IDS   (e.g. "123,456")
 * - UO_DISCORD_IDS       (e.g. "123,789")
 */
function parseIdList(v: string | undefined | null): string[] {
  return String(v ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

const EDITOR_IDS = parseIdList(process.env.EDITOR_DISCORD_IDS);
const UO_IDS = parseIdList(process.env.UO_DISCORD_IDS);

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
        null;

      if (discordId) {
        (token as any).discordId = String(discordId);
        (token as any).isEditor = EDITOR_IDS.includes(String(discordId));
        (token as any).canSeeUO = UO_IDS.includes(String(discordId));
      } else {
        (token as any).discordId = null;
        (token as any).isEditor = false;
        (token as any).canSeeUO = false;
      }
      return token;
    },
    async session({ session, token }) {
      (session as any).discordId = (token as any).discordId ?? null;
      (session as any).isEditor = !!(token as any).isEditor;
      (session as any).canSeeUO = !!(token as any).canSeeUO;
      return session;
    },
  },
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
