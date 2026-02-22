import { getToken } from "next-auth/jwt";
import { supabaseAdmin } from "@/lib/supabase";
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


type DbPerms = {
  display_name?: string | null;
  is_admin?: boolean | null;
  is_editor?: boolean | null;
  can_see_uo?: boolean | null;
  can_see_fe?: boolean | null;
};

async function fetchDbPerms(discordId: string): Promise<DbPerms | null> {
  try {
    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from("gm_user_permissions")
      .select("display_name,is_admin,is_editor,can_see_uo,can_see_fe")
      .eq("discord_id", discordId)
      .maybeSingle();
    if (error) return null;
    return data ?? null;
  } catch {
    return null;
  }
}

function parseAllowList(envName: string): Set<string> {
  const raw = (process.env[envName] ?? "").trim();
  if (!raw) return new Set();
  return new Set(raw.split(",").map((s) => s.trim()).filter(Boolean));
}

const ADMIN_IDS = parseAllowList("ADMIN_DISCORD_IDS");
const EDITOR_IDS = parseAllowList("EDITOR_DISCORD_IDS");
const UO_IDS = parseAllowList("UO_DISCORD_IDS");

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

    const db = await fetchDbPerms(discordId);

    const isAdmin =
      !!(token as any)?.isAdmin || ADMIN_IDS.has(discordId) || (db?.is_admin ?? false);

    const canSeeFE =
      isAdmin || !!(token as any)?.canSeeFE || (db?.can_see_fe ?? false);

    const canSeeUO =
      isAdmin || !!(token as any)?.canSeeUO || UO_IDS.has(discordId) || (db?.can_see_uo ?? false);

    const nameFromToken = String((token as any)?.name ?? "");
    const name = String(db?.display_name ?? nameFromToken ?? "");

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
