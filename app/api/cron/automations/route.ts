import { NextResponse } from "next/server";
import { runDiscordAutomations } from "@/lib/automations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Auth strategy:
 * 1) Allow official Vercel Cron invocations (header x-vercel-cron: 1)
 * 2) Additionally allow manual/external triggers via CRON_SECRET (query ?secret= or header x-cron-secret)
 */
function isVercelCron(req: Request): boolean {
  return (req.headers.get("x-vercel-cron") ?? "").trim() === "1";
}

function okSecret(req: Request): boolean {
  const need = (process.env.CRON_SECRET ?? "").trim();
  if (!need) return false;
  const url = new URL(req.url);
  const q = (url.searchParams.get("secret") ?? "").trim();
  const h = (req.headers.get("x-cron-secret") ?? "").trim();
  return q === need || h === need;
}

export async function GET(req: Request) {
  // Vercel Cron should work without secrets.
  // Secret remains useful for manual testing / non-vercel triggers.
  if (!isVercelCron(req) && !okSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runDiscordAutomations();
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json(
      { error: "Server error", details: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}