import { NextResponse } from "next/server";
import { runDiscordAutomations } from "@/lib/automations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function okSecret(req: Request): boolean {
  const need = (process.env.CRON_SECRET ?? "").trim();
  if (!need) return false;

  const url = new URL(req.url);
  const q = (url.searchParams.get("secret") ?? "").trim();
  const h = (req.headers.get("x-cron-secret") ?? "").trim();

  return q === need || h === need;
}

export async function GET(req: Request) {
  if (!okSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runDiscordAutomations();
    return NextResponse.json({
      success: true,
      result
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: "Server error", details: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}