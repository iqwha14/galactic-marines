import { auth } from "@/auth";

export type GateResult = {
  ok: boolean;
  status: number;
  error?: string;
  session?: any;
  discordId?: string;
  isEditor?: boolean;
  canSeeUO?: boolean;
};

export async function requireSignedIn(_req?: Request): Promise<GateResult> {
  const session = await auth();
  const discordId = (session as any)?.discordId || (session as any)?.user?.id;

  if (!discordId) return { ok: false, status: 401, error: "Not signed in" };

  return {
    ok: true,
    status: 200,
    session,
    discordId: String(discordId),
    isEditor: !!(session as any)?.isEditor,
    canSeeUO: !!(session as any)?.canSeeUO,
  };
}

export async function requireEditor(req?: Request): Promise<GateResult> {
  const gate = await requireSignedIn(req);
  if (!gate.ok) return gate;
  if (!gate.isEditor) return { ok: false, status: 403, error: "Editor access denied" };
  return gate;
}

export async function requireUO(req?: Request): Promise<GateResult> {
  const gate = await requireSignedIn(req);
  if (!gate.ok) return gate;
  if (!gate.canSeeUO) return { ok: false, status: 403, error: "UO access denied" };
  return gate;
}
