import NextAuth, { type NextAuthOptions } from "next-auth";
import DiscordProvider from "next-auth/providers/discord";

function parseAllowlist(envName: string): Set<string> {
  const raw = process.env[envName] ?? "";
  return new Set(
    raw
      .split(/[\s,;]+/g)
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

const editors = parseAllowlist("EDITOR_DISCORD_IDS");
const uo = parseAllowlist("UO_DISCORD_IDS");

export const authOptions: NextAuthOptions = {
  providers: [
    DiscordProvider({
      clientId: process.env.DISCORD_CLIENT_ID ?? "",
      clientSecret: process.env.DISCORD_CLIENT_SECRET ?? "",
      // Identify + basic profile is enough
      authorization: { params: { scope: "identify" } },
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, account, profile }) {
      // Discord user id
      if (account?.provider === "discord") {
        const discordId = (profile as any)?.id ?? (token as any)?.discordId;
        (token as any).discordId = String(discordId ?? "");
      }
      const did = String((token as any).discordId ?? "");
      (token as any).isEditor = did ? editors.has(did) : false;
      (token as any).canSeeUO = did ? uo.has(did) : false;
      return token;
    },
    async session({ session, token }) {
      (session as any).discordId = String((token as any).discordId ?? "");
      (session as any).isEditor = !!(token as any).isEditor;
      (session as any).canSeeUO = !!(token as any).canSeeUO;
      return session;
    },
  },
  // You can optionally set NEXTAUTH_SECRET in env.
  secret: process.env.NEXTAUTH_SECRET,
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
