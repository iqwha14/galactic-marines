import NextAuth from "next-auth";
import Discord from "next-auth/providers/discord";

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
      (token as any).isEditor = EDITOR_IDS.has(id);
      (token as any).canSeeUO = UO_IDS.has(id);

      return token;
    },
    async session({ session, token }) {
      (session as any).discordId = (token as any).discordId ?? null;
      (session as any).isEditor = !!(token as any).isEditor;
      (session as any).canSeeUO = !!(token as any).canSeeUO;
      return session;
    },
  },
});
