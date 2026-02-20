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

function parseAllowlist(...envNames: string[]): Set<string> {
  const all: string[] = [];
  for (const n of envNames) {
    const raw = process.env[n] ?? "";
    if (raw) all.push(raw);
  }
  return new Set(
    all
      .join(",")
      .split(/[\s,\n]+/g)
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

// Support BOTH variants used across the project
// - New: GM_EDITORS / GM_UO_VIEWERS
// - Old/NextAuth: EDITOR_DISCORD_IDS / UO_DISCORD_IDS
const EDITORS = parseAllowlist("GM_EDITORS", "EDITOR_DISCORD_IDS");
const UO_VIEWERS = parseAllowlist("GM_UO_VIEWERS", "UO_DISCORD_IDS");

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

    // Prefer token flags if present (set by NextAuth callback), but fall back to allowlists.
    const tokenIsEditor = Boolean((token as any)?.isEditor);
    const tokenCanSeeUO = Boolean((token as any)?.canSeeUO);

    const listIsEditor = EDITORS.size ? EDITORS.has(discordId) : false;
    const isEditor = tokenIsEditor || listIsEditor;

    const listCanSeeUO = UO_VIEWERS.size ? UO_VIEWERS.has(discordId) : false;
    const canSeeUO = tokenCanSeeUO || listCanSeeUO || isEditor;

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
