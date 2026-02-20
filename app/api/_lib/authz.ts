import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]/options";

export type SessionWithRoles = {
  user?: { name?: string | null; email?: string | null; image?: string | null };
  discordId?: string | null;
  isEditor?: boolean;
  canSeeUO?: boolean;
};

export async function requireSignedIn() {
  const session = (await getServerSession(authOptions)) as any as SessionWithRoles | null;
  if (!session?.discordId) {
    return { ok: false as const, status: 401, error: "Not signed in" };
  }
  return { ok: true as const, session };
}

export async function requireEditor() {
  const base = await requireSignedIn();
  if (!base.ok) return base;
  if (!base.session.isEditor) {
    return { ok: false as const, status: 403, error: "Editor access denied" };
  }
  return base;
}

export async function requireUO() {
  const base = await requireSignedIn();
  if (!base.ok) return base;
  if (!base.session.canSeeUO) {
    return { ok: false as const, status: 403, error: "UO access denied" };
  }
  return base;
}
