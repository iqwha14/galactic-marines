import type { NextAuthOptions } from "next-auth";
import DiscordProvider from "next-auth/providers/discord";

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
const FE_IDS = parseAllowList("FE_DISCORD_IDS");

export const authOptions: NextAuthOptions = {
  providers: [
    DiscordProvider({
      clientId: process.env.DISCORD_CLIENT_ID ?? "",
      clientSecret: process.env.DISCORD_CLIENT_SECRET ?? "",
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, profile }) {
      const discordId = (profile as any)?.id ?? (token as any)?.discordId;
      if (discordId) (token as any).discordId = String(discordId);

      const id = String((token as any).discordId ?? "");
      const isAdmin = ADMIN_IDS.has(id);
      const isEditor = isAdmin || EDITOR_IDS.has(id);
      (token as any).isAdmin = isAdmin;
      (token as any).isEditor = isEditor;
      (token as any).canSeeUO = isAdmin || isEditor || UO_IDS.has(id);
      (token as any).canSeeFE = isAdmin || isEditor || FE_IDS.has(id);

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
