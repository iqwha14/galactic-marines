import { getToken } from "next-auth/jwt";
import { NextRequest } from "next/server";
import { cookies, headers } from "next/headers";

export type GateSession = {
  discordId: string;
  isEditor: boolean;
  isAdmin: boolean;
  canSeeUO: boolean;
  canSeeFE: boolean;
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

const EDITORS = new Set<string>([
  ...parseAllowlist("GM_EDITORS"),
  ...parseAllowlist("EDITOR_DISCORD_IDS"),
]);

const ADMINS = new Set<string>([
  ...parseAllowlist("GM_ADMINS"),
  ...parseAllowlist("ADMIN_DISCORD_IDS"),
]);

const UO_VIEWERS = new Set<string>([
  ...parseAllowlist("GM_UO_VIEWERS"),
  ...parseAllowlist("UO_DISCORD_IDS"),
]);

const FE_VIEWERS = new Set<string>([
  ...parseAllowlist("GM_FE_VIEWERS"),
  ...parseAllowlist("FE_DISCORD_IDS"),
]);

type RoleRow = {
  discord_id: string;
  is_editor: boolean | null;
  is_admin: boolean | null;
  can_see_uo: boolean | null;
  can_see_fe: boolean | null;
};

async function readRoleOverrides(discordId: string): Promise<Partial<GateSession> | null> {
  try {
    const { supabaseAdmin } = await import("@/lib/supabase");
    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from("gm_user_permissions")
      .select("discord_id,is_editor,is_admin,can_see_uo,can_see_fe")
      .eq("discord_id", discordId)
      .maybeSingle();

    if (error || !data) return null;
    const row = data as RoleRow;
    return {
      isEditor: !!row.is_editor,
      isAdmin: !!row.is_admin,
      canSeeUO: !!row.can_see_uo,
      canSeeFE: !!row.can_see_fe,
    };
  } catch {
    return null;
  }
}

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

    let isAdmin = ADMINS.size ? ADMINS.has(discordId) : false;
    let isEditor = EDITORS.size ? EDITORS.has(discordId) : false;
    let canSeeUO = UO_VIEWERS.size ? UO_VIEWERS.has(discordId) : false;
    let canSeeFE = FE_VIEWERS.size ? FE_VIEWERS.has(discordId) : false;

    // Admin implies everything
    if (isAdmin) {
      isEditor = true;
      canSeeUO = true;
      canSeeFE = true;
    }

    // Editor implies FE+UO by default
    canSeeUO = canSeeUO || isEditor;
    canSeeFE = canSeeFE || isEditor;

    // Optional DB overrides
    const ovr = await readRoleOverrides(discordId);
    if (ovr) {
      if (typeof ovr.isAdmin === "boolean") isAdmin = ovr.isAdmin;
      if (typeof ovr.isEditor === "boolean") isEditor = ovr.isEditor || isAdmin;
      if (typeof ovr.canSeeUO === "boolean") canSeeUO = ovr.canSeeUO || isEditor || isAdmin;
      if (typeof ovr.canSeeFE === "boolean") canSeeFE = ovr.canSeeFE || isEditor || isAdmin;
    }

    const name = String((token as any)?.name ?? "");

    return {
      ok: true,
      status: 200,
      session: { discordId, isEditor, isAdmin, canSeeUO, canSeeFE, name: name || undefined },
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

export async function requireAdmin(req?: Request): Promise<GateResult> {
  const gate = await getGate(req);
  if (!gate.ok) return gate;
  if (!gate.session?.isAdmin) return { ok: false, status: 403, error: "Admin access denied" };
  return gate;
}

export async function requireUO(req?: Request): Promise<GateResult> {
  const gate = await getGate(req);
  if (!gate.ok) return gate;
  if (!gate.session?.canSeeUO) return { ok: false, status: 403, error: "UO access denied" };
  return gate;
}

export async function requireFE(req?: Request): Promise<GateResult> {
  const gate = await getGate(req);
  if (!gate.ok) return gate;
  if (!gate.session?.canSeeFE) return { ok: false, status: 403, error: "FE access denied" };
  return gate;
}
