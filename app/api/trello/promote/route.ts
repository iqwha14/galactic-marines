import { NextResponse } from "next/server";
import { requiredEnv, trelloBaseParams } from "../../_lib/trello";
import { requireSignedIn, requireFE, requireAdmin, requireUO } from "@/lib/authz";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function pickRole(gate: any) {
  return gate?.session?.isAdmin ? "ADMIN" : gate?.session?.canSeeFE ? "FE" : gate?.session?.canSeeUO ? "UO" : "STANDARD";
}

export async function POST(req: Request) {
  // everyone must be signed in at least
  const signed = await requireSignedIn(req);
  if (!signed.ok) return NextResponse.json({ error: signed.error }, { status: signed.status });

  const role = pickRole(signed);

  const body = await req.json().catch(() => ({} as any));
  const cardId = String(body?.cardId ?? "").trim();
  const listId = String(body?.listId ?? "").trim();

  if (!cardId || !listId) {
    return NextResponse.json({ error: "cardId and listId required" }, { status: 400 });
  }

  // Permissions:
  // - ADMIN/FE: allow all
  // - UO: only allow Rekrut -> PFC (enforced server-side by comparing current list rank if provided)
  if (role === "STANDARD") return NextResponse.json({ error: "Access denied" }, { status: 403 });

  // If UO, we need to verify it is Rekrut -> PFC by reading the card and list names.
  if (role === "UO") {
    const key = requiredEnv("TRELLO_KEY");
    const token = requiredEnv("TRELLO_TOKEN");
    const base = trelloBaseParams();
    const cardUrl = `https://api.trello.com/1/cards/${cardId}?${base}&fields=idList,name`;
    const cardRes = await fetch(cardUrl, { cache: "no-store" });
    const cardJson = await cardRes.json().catch(() => null);
    if (!cardRes.ok) {
      return NextResponse.json({ error: "Trello card read failed", details: cardJson }, { status: 500 });
    }

    const fromListId = String(cardJson?.idList ?? "");
    if (!fromListId) return NextResponse.json({ error: "Cannot resolve current list" }, { status: 500 });

    // Read list names
    const fromListUrl = `https://api.trello.com/1/lists/${fromListId}?${base}&fields=name`;
    const toListUrl = `https://api.trello.com/1/lists/${listId}?${base}&fields=name`;
    const [fromRes, toRes] = await Promise.all([fetch(fromListUrl), fetch(toListUrl)]);
    const fromJ = await fromRes.json().catch(() => null);
    const toJ = await toRes.json().catch(() => null);

    const fromName = String(fromJ?.name ?? "").toLowerCase();
    const toName = String(toJ?.name ?? "").toLowerCase();

    const ok = fromName.includes("private rekrut") && toName.includes("private first class");
    if (!ok) {
      return NextResponse.json({ error: "UO darf nur Private Rekrut → Private First Class befördern." }, { status: 403 });
    }
  }

  try {
    const base = trelloBaseParams();
    const url = `https://api.trello.com/1/cards/${cardId}?${base}`;

    // Trello is most compatible with urlencoded bodies.
    const params = new URLSearchParams();
    params.set("idList", listId);

    const res = await fetch(url, {
      method: "PUT",
      headers: { "content-type": "application/x-www-form-urlencoded; charset=UTF-8" },
      body: params.toString(),
    });

    const text = await res.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { /* ignore */ }

    if (!res.ok) {
      return NextResponse.json(
        { error: "Trello move failed", status: res.status, details: json ?? text },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, moved: true, card: json ?? text });
  } catch (e: any) {
    return NextResponse.json({ error: "Server error", details: e?.message ?? String(e) }, { status: 500 });
  }
}
