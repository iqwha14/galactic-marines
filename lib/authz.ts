import { getToken } from "next-auth/jwt";
import { NextRequest } from "next/server";
import { cookies, headers } from "next/headers";

export type GateSession = {
  discordId: string;
  isEditor: boolean;
  canSeeUO: boolean;
  name?: string;
};

export type GateResult = {
  ok: boolean;
  status: number;
  error?: string;
  session?: GateSession;
};

function parseAllowlist(envName: string): Set<string> {
  const raw = process.env[envName] ?? "";
  return new Set(
    raw
      .split(/[,\n\s]+/g)
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

// Backwards-/compat: other parts of the app use EDITOR_DISCORD_IDS / UO_DISCORD_IDS
// while some routes used GM_EDITORS / GM_UO_VIEWERS. Support both.
const EDITORS = new Set<string>([
  ...parseAllowlist("GM_EDITORS"),
  ...parseAllowlist("EDITOR_DISCORD_IDS"),
]);
const UO_VIEWERS = new Set<string>([
  ...parseAllowlist("GM_UO_VIEWERS"),
  ...parseAllowlist("UO_DISCORD_IDS"),
]);

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
    const discordId = String((token as any)?.discordId ?? (token as any)?.sub ?? "");
    if (!discordId) return { ok: false, status: 401, error: "Not signed in" };

    // Prefer token flags from NextAuth callbacks (most reliable), but allow env allow-lists too.
    const tokenEditor = !!(token as any)?.isEditor;
    const tokenUO = !!(token as any)?.canSeeUO;
    const isEditor = tokenEditor || (EDITORS.size ? EDITORS.has(discordId) : false);
    const canSeeUO = isEditor || tokenUO || (UO_VIEWERS.size ? UO_VIEWERS.has(discordId) : false);
    const name = String((token as any)?.name ?? "");

    return {
      ok: true,
      status: 200,
      session: { discordId, isEditor, canSeeUO, name: name || undefined },
    };
  } catch (e: any) {
    return { ok: false, status: 500, error: e?.message || "Auth error" };
  }
}

export async function requireSignedIn(req?: Request): Promise<GateResult> {
  return getGate(req);
}

export async function requireEditor(req?: Request): Promise<GateResult> {
  const gate = await getGate(req);
  if (!gate.ok) return gate;
  if (!gate.session?.isEditor) return { ok: false, status: 403, error: "Editor access denied" };
  return gate;
}

export async function requireUO(req?: Request): Promise<GateResult> {
  const gate = await getGate(req);
  if (!gate.ok) return gate;
  if (!gate.session?.canSeeUO) return { ok: false, status: 403, error: "UO access denied" };
  return gate;
}
