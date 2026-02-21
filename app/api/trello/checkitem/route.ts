import { NextResponse } from "next/server";
import { requireSignedIn } from "@/lib/authz";
import { trelloBaseParams } from "../../_lib/trello";

export async function POST(req: Request) {
  const gate = await requireSignedIn(req);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const canToggle = !!(gate.session?.canSeeFE || gate.session?.canSeeUO);
  if (!canToggle) return NextResponse.json({ error: "Access denied" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const cardId = String(body?.cardId ?? "");
  const checkItemId = String(body?.checkItemId ?? "");
  const state = String(body?.state ?? "");

  if (!cardId || !checkItemId || (state !== "complete" && state !== "incomplete")) {
    return NextResponse.json({ error: "Missing/invalid fields" }, { status: 400 });
  }

  const { key, token } = trelloBaseParams();
  const url = new URL(`https://api.trello.com/1/cards/${cardId}/checkItem/${checkItemId}`);
  url.searchParams.set("key", key);
  url.searchParams.set("token", token);
  url.searchParams.set("state", state);

  const res = await fetch(url.toString(), { method: "PUT" });
  const text = await res.text();
  if (!res.ok) {
    return NextResponse.json({ error: "Trello update failed", status: res.status, details: text }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
