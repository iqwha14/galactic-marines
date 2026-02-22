import { getToken } from "next-auth/jwt";
import { NextRequest } from "next/server";
import { cookies, headers } from "next/headers";

export type GateSession = {
  discordId: string;
  isAdmin: boolean;
  canSeeFE: boolean;
  canSeeUO: boolean;
  name?: string;
};

export type GateResult = {
  ok: boolean;
  status: number;
  error?: string;
  session?: GateSession;
};

function makeNextRequestFromContext(): NextRequest {
  const h = new Headers(headers());
  const cookieStr = cookies()
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
  if (cookieStr) h.set("cookie", cookieStr);
  return new NextRequest(process.env.NEXTAUTH_URL || "http://localhost", { headers: h });
}

async function getGate(req?: Request): Promise<GateResult> {
  try {
    const nextReq = (req ? (req as any) : makeNextRequestFromContext()) as NextRequest;
    const token = await getToken({ req: nextReq, secret: process.env.NEXTAUTH_SECRET });

    const discordId = String(
      (token as any)?.discordId ??
        (token as any)?.sub ??
        ""
    );

    if (!discordId) return { ok: false, status: 401, error: "Not signed in" };

    const isAdmin = !!(token as any)?.isAdmin;
    const canSeeFE = !!(token as any)?.canSeeFE;
    const canSeeUO = !!(token as any)?.canSeeUO;
    const name = String((token as any)?.name ?? "");

    return {
      ok: true,
      status: 200,
      session: { discordId, isAdmin, canSeeFE, canSeeUO, name: name || undefined },
    };
  } catch (e: any) {
    return { ok: false, status: 500, error: e?.message || "Auth error" };
  }
}

export async function requireSignedIn(req?: Request): Promise<GateResult> {
  return getGate(req);
}

export async function requireAdmin(req?: Request): Promise<GateResult> {
  const g = await getGate(req);
  if (!g.ok) return g;
  if (!g.session?.isAdmin) return { ok: false, status: 403, error: "Admin access denied" };
  return g;
}

export async function requireFE(req?: Request): Promise<GateResult> {
  const g = await getGate(req);
  if (!g.ok) return g;
  if (!(g.session?.isAdmin || g.session?.canSeeFE)) return { ok: false, status: 403, error: "FE access denied" };
  return g;
}

export async function requireUO(req?: Request): Promise<GateResult> {
  const g = await getGate(req);
  if (!g.ok) return g;
  if (!(g.session?.isAdmin || g.session?.canSeeFE || g.session?.canSeeUO)) return { ok: false, status: 403, error: "UO access denied" };
  return g;
}

/** Backward-compat for older routes; Editor == FE in the 4-role model. */
export async function requireEditor(req?: Request): Promise<GateResult> {
  return requireFE(req);
}
