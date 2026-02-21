import { NextResponse } from "next/server";
import { requireSignedIn } from "@/lib/authz";
import { trelloBaseParams } from "../../_lib/trello";

function norm(s: string) {
  return String(s ?? "").trim().toLowerCase();
}

function isPrivateRekrut(rankOrListName: string) {
  const r = norm(rankOrListName);
  return r.includes("private rekrut") || r.includes("rekrut");
}

function isPrivateFirstClass(rankOrListName: string) {
  const r = norm(rankOrListName);
  return r.includes("private first class");
}

export async function POST(req: Request) {
  const gate = await requireSignedIn(req);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const body = await req.json().catch(() => ({}));
  const cardId = String(body?.cardId ?? body?.card_id ?? "");
  const listId = String(body?.listId ?? body?.list_id ?? "");
  if (!cardId || !listId) return NextResponse.json({ error: "Missing cardId/listId" }, { status: 400 });

  const key = process.env.TRELLO_KEY ?? "";
  const token = process.env.TRELLO_TOKEN ?? "";
  if (!key || !token) return NextResponse.json({ error: "Missing Trello env vars" }, { status: 500 });

  // Determine current list name and target list name for permission checks (UO limited)
  const cardUrl = `https://api.trello.com/1/cards/${encodeURIComponent(cardId)}?fields=idList&${trelloBaseParams()}`;
  const cardRes = await fetch(cardUrl, { cache: "no-store" });
  const cardRaw = await cardRes.text();
  if (!cardRes.ok) {
    return NextResponse.json({ error: "Trello card read failed", status: cardRes.status, details: cardRaw.slice(0, 500) }, { status: 500 });
  }
  const cardJson = JSON.parse(cardRaw);
  const currentListId = String(cardJson?.idList ?? "");

  const listName = async (id: string) => {
    const url = `https://api.trello.com/1/lists/${encodeURIComponent(id)}?fields=name&${trelloBaseParams()}`;
    const res = await fetch(url, { cache: "no-store" });
    const raw = await res.text();
    if (!res.ok) throw new Error(raw);
    const j = JSON.parse(raw);
    return String(j?.name ?? "");
  };

  let currentListName = "";
  let targetListName = "";
  try {
    [currentListName, targetListName] = await Promise.all([listName(currentListId), listName(listId)]);
  } catch (e: any) {
    return NextResponse.json({ error: "Trello list read failed", details: e?.message ?? String(e) }, { status: 500 });
  }

  const isAdmin = !!gate.session?.isAdmin;
  const isFE = !!gate.session?.canSeeFE;
  const isUO = !!gate.session?.canSeeUO && !isFE && !isAdmin;

  // FE + Einheitsleitung: everything allowed
  if (!isAdmin && !isFE) {
    // UO: only Private Rekrut -> Private First Class promotion
    if (!isUO) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
    const ok = isPrivateRekrut(currentListName) && isPrivateFirstClass(targetListName);
    if (!ok) {
      return NextResponse.json({ error: "UO limited: only Private Rekrut → Private First Class" }, { status: 403 });
    }
  }

  const moveUrl = `https://api.trello.com/1/cards/${encodeURIComponent(cardId)}?idList=${encodeURIComponent(
    listId
  )}&${trelloBaseParams()}`;

  const res = await fetch(moveUrl, { method: "PUT", cache: "no-store" });
  const raw = await res.text();
  if (!res.ok) {
    return NextResponse.json({ error: "Trello move failed", status: res.status, details: raw.slice(0, 500) }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
