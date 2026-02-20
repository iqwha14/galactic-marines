import { getServerSession } from "next-auth/next";

// IMPORTANT:
// - This helper is used by many API routes.
// - Some routes call requireSignedIn() with NO args. Others pass (req).
//   So the parameter is OPTIONAL to avoid TS "Expected 1 arguments" errors.
// - It returns a *gate* object with { ok, status, error, session } so routes can do gate.ok checks.

import { authOptions } from "../auth/[...nextauth]/route";

export type GateResult = {
  ok: boolean;
  status: number;
  error?: string;
  session?: any;
};

export async function requireSignedIn(_req?: Request): Promise<GateResult> {
  const session = await getServerSession(authOptions as any);

  const discordId =
    (session as any)?.discordId ||
    (session as any)?.user?.id ||
    (session as any)?.user?.discordId ||
    null;

  if (!session || !discordId) {
    return { ok: false, status: 401, error: "Not signed in" };
  }

  return { ok: true, status: 200, session };
}

export async function requireEditor(req?: Request): Promise<GateResult> {
  const gate = await requireSignedIn(req);
  if (!gate.ok) return gate;

  const isEditor = !!(gate.session as any)?.isEditor;
  if (!isEditor) return { ok: false, status: 403, error: "Editor access denied", session: gate.session };

  return gate;
}

export async function requireUO(req?: Request): Promise<GateResult> {
  const gate = await requireSignedIn(req);
  if (!gate.ok) return gate;

  const canSeeUO = !!(gate.session as any)?.canSeeUO;
  if (!canSeeUO) return { ok: false, status: 403, error: "UO access denied", session: gate.session };

  return gate;
}
