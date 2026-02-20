import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

export type GateResult = {
  ok: boolean;
  status: number;
  error?: string;
  session?: any;
};

/**
 * Require Discord sign-in.
 * `req` is optional so routes can call `requireSignedIn()` with no args.
 */
export async function requireSignedIn(_req?: Request): Promise<GateResult> {
  const session = await getServerSession(authOptions);
  const discordId = (session as any)?.discordId;
  if (!discordId) return { ok: false, status: 401, error: "not signed in" };
  return { ok: true, status: 200, session };
}

export async function requireEditor(req?: Request): Promise<GateResult> {
  const gate = await requireSignedIn(req);
  if (!gate.ok) return gate;
  if (!(gate.session as any)?.isEditor) return { ok: false, status: 403, error: "editor access denied", session: gate.session };
  return gate;
}

export async function requireUO(req?: Request): Promise<GateResult> {
  const gate = await requireSignedIn(req);
  if (!gate.ok) return gate;
  if (!(gate.session as any)?.canSeeUO) return { ok: false, status: 403, error: "uo access denied", session: gate.session };
  return gate;
}
