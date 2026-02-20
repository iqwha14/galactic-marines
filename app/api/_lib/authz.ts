import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

export type GateResult = {
  ok: boolean;
  status: number;
  error?: string;
  session?: any;
};

/**
 * Works in App Router routes.
 * Accepts an optional Request arg so existing calls like requireSignedIn(req) won't break.
 */
export async function requireSignedIn(_req?: Request): Promise<GateResult> {
  const session = await getServerSession(authOptions);
  const discordId = (session as any)?.discordId;
  if (!discordId) return { ok: false, status: 401, error: "Not signed in" };
  return { ok: true, status: 200, session };
}

export async function requireEditor(_req?: Request): Promise<GateResult> {
  const gate = await requireSignedIn();
  if (!gate.ok) return gate;
  if (!(gate.session as any)?.isEditor) return { ok: false, status: 403, error: "Editor access denied" };
  return gate;
}

export async function requireUO(_req?: Request): Promise<GateResult> {
  const gate = await requireSignedIn();
  if (!gate.ok) return gate;
  if (!(gate.session as any)?.canSeeUO) return { ok: false, status: 403, error: "UO access denied" };
  return gate;
}
