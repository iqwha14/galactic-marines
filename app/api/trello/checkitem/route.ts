import { NextResponse } from "next/server";
import { requireSignedIn } from "@/lib/authz";
import { trelloBaseParams } from "../../_lib/trello";

export async function POST(req: Request) {
  const gate = await requireSignedIn(req);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  // UO, FE, Einheitsleitung dürfen abhaken
  if (!gate.session?.canSeeUO) {
    return NextResponse.json({ error: "UO access denied" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const cardId = String(body?.cardId ?? body?.card_id ?? "");
  const checkItemId = String(body?.checkItemId ?? body?.check_item_id ?? "");
  const state = String(body?.state ?? "");

  if (!cardId || !checkItemId || !state) {
    return NextResponse.json({ error: "Missing cardId/checkItemId/state" }, { status: 400 });
  }
  if (state !== "complete" && state !== "incomplete") {
    return NextResponse.json({ error: "Invalid state" }, { status: 400 });
  }

  const key = process.env.TRELLO_KEY ?? "";
  const token = process.env.TRELLO_TOKEN ?? "";
  if (!key || !token) return NextResponse.json({ error: "Missing Trello env vars" }, { status: 500 });

  // Need checklist id; Trello API for checkItem state update uses /cards/{id}/checkItem/{idCheckItem}?state=...
  const url = `https://api.trello.com/1/cards/${encodeURIComponent(cardId)}/checkItem/${encodeURIComponent(
    checkItemId
  )}?state=${encodeURIComponent(state)}&${trelloBaseParams()}`;

  const res = await fetch(url, { method: "PUT", cache: "no-store" });
  const raw = await res.text();
  if (!res.ok) {
    return NextResponse.json({ error: "Trello update failed", status: res.status, details: raw.slice(0, 500) }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
