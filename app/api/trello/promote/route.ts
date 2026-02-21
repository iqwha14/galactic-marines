import { NextResponse } from "next/server";
import { requireSignedIn } from "@/lib/authz";
import { trelloBaseParams } from "../../_lib/trello";

const norm = (s: string) => (s ?? "").trim().toLowerCase();

async function fetchListName(listId: string, key: string, token: string): Promise<string> {
  const url = new URL(`https://api.trello.com/1/lists/${listId}`);
  url.searchParams.set("key", key);
  url.searchParams.set("token", token);
  url.searchParams.set("fields", "name");
  const res = await fetch(url.toString(), { cache: "no-store" });
  const text = await res.text();
  if (!res.ok) throw new Error(`Trello list fetch failed (${res.status}): ${text}`);
  const json = JSON.parse(text);
  return String(json?.name ?? "");
}

export async function POST(req: Request) {
  const gate = await requireSignedIn(req);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const body = await req.json().catch(() => ({}));
  const cardId = String(body?.cardId ?? "");
  const listId = String(body?.listId ?? "");

  if (!cardId || !listId) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const { key, token } = trelloBaseParams();

  // Permission rules:
  // - FE (canSeeFE) can promote/demote any rank.
  // - UO (canSeeUO) can ONLY promote Private Rekrut -> Private First Class (no demotion, nothing else).
  const canFE = !!gate.session?.canSeeFE;
  const canUO = !!gate.session?.canSeeUO;

  if (!canFE) {
    if (!canUO) return NextResponse.json({ error: "Access denied" }, { status: 403 });

    // Determine current rank via card's list
    const cardUrl = new URL(`https://api.trello.com/1/cards/${cardId}`);
    cardUrl.searchParams.set("key", key);
    cardUrl.searchParams.set("token", token);
    cardUrl.searchParams.set("fields", "idList");
    const cardRes = await fetch(cardUrl.toString(), { cache: "no-store" });
    const cardText = await cardRes.text();
    if (!cardRes.ok) {
      return NextResponse.json({ error: "Trello card fetch failed", status: cardRes.status, details: cardText }, { status: 500 });
    }
    const cardJson = JSON.parse(cardText);
    const currentListId = String(cardJson?.idList ?? "");
    if (!currentListId) return NextResponse.json({ error: "Could not resolve current rank" }, { status: 500 });

    try {
      const [fromName, toName] = await Promise.all([
        fetchListName(currentListId, key, token),
        fetchListName(listId, key, token),
      ]);

      const fromN = norm(fromName);
      const toN = norm(toName);

      const ok = fromN.includes("private rekrut") && toN.includes("private first class");
      if (!ok) {
        return NextResponse.json(
          { error: "UO restriction: only Private Rekrut -> Private First Class is allowed." },
          { status: 403 }
        );
      }
    } catch (e: any) {
      return NextResponse.json({ error: "Rank validation failed", details: e?.message ?? String(e) }, { status: 500 });
    }
  }

  // move card
  const url = new URL(`https://api.trello.com/1/cards/${cardId}`);
  url.searchParams.set("key", key);
  url.searchParams.set("token", token);

  // Trello accepts idList either as query param or body. Some environments reject query-only updates,
  // so we send a form body for maximum compatibility.
  const res = await fetch(url.toString(), {
    method: "PUT",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: `idList=${encodeURIComponent(listId)}`,
  });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ error: `Trello move failed (${res.status})`, status: res.status, details: text }, { status: 500 });

  return NextResponse.json({ ok: true });
}
