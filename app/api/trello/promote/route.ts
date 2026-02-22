import { NextResponse } from "next/server";
import { requiredEnv, trelloBaseParams } from "../../_lib/trello";
import { requireSignedIn } from "@/lib/authz";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const norm = (s: string) => (s ?? "").trim().toLowerCase();

/** Commander oben, Rekrut unten */
const rankOrder = [
  "commander",
  "major",
  "captain",
  "first lieutenant",
  "lieutenant",
  "sergeant major",
  "staff sergeant",
  "sergeant",
  "corporal",
  "lance corporal",
  "private first class",
  "private rekrut",
];

function rankIndex(name: string): number {
  const r = norm(name);
  for (let i = 0; i < rankOrder.length; i++) if (r.includes(rankOrder[i])) return i;
  if (r.includes("private") || r.includes("rekrut")) return 10_000;
  return 5_000;
}

type TrelloList = { id: string; name: string };

async function fetchJson(url: string) {
  const res = await fetch(url, { cache: "no-store" });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* ignore */ }
  return { res, text, json };
}

export async function POST(req: Request) {
  const gate = await requireSignedIn(req);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const isAdmin = !!gate.session?.isAdmin;
  const isFE = !!gate.session?.canSeeFE;
  const isUO = !!gate.session?.canSeeUO;

  const body = await req.json().catch(() => ({} as any));
  const cardId = String(body?.cardId ?? "").trim();
  const direction = String(body?.direction ?? "").trim(); // promote | demote

  if (!cardId) return NextResponse.json({ error: "cardId required" }, { status: 400 });
  if (!["promote", "demote"].includes(direction)) return NextResponse.json({ error: "direction must be promote|demote" }, { status: 400 });

  // Permissions
  if (!(isAdmin || isFE || isUO)) return NextResponse.json({ error: "Access denied" }, { status: 403 });

  const { key, token } = trelloBaseParams();
  const boardId = requiredEnv("TRELLO_BOARD_ID");

  // Read card current list
  const cardUrl = `https://api.trello.com/1/cards/${cardId}?key=${key}&token=${token}&fields=idList`;
  const card = await fetchJson(cardUrl);
  if (!card.res.ok) return NextResponse.json({ error: "Trello card read failed", status: card.res.status, details: card.json ?? card.text }, { status: 500 });

  const fromListId = String(card.json?.idList ?? "");
  if (!fromListId) return NextResponse.json({ error: "Cannot resolve current list" }, { status: 500 });

  // Get all lists on board
  const listsUrl = `https://api.trello.com/1/boards/${boardId}/lists?key=${key}&token=${token}&fields=name`;
  const listsResp = await fetchJson(listsUrl);
  if (!listsResp.res.ok) return NextResponse.json({ error: "Trello lists read failed", status: listsResp.res.status, details: listsResp.json ?? listsResp.text }, { status: 500 });

  const lists = (Array.isArray(listsResp.json) ? listsResp.json : []) as TrelloList[];
  const ranked = lists
    .map((l) => ({ ...l, idx: rankIndex(l.name) }))
    .filter((l) => l.idx < 5000) // only lists that look like ranks
    .sort((a, b) => a.idx - b.idx);

  const from = ranked.find((l) => l.id === fromListId);
  if (!from) {
    // If current list is not a rank list, we can't compute next.
    return NextResponse.json(
      { error: "Ziel Rang nicht gefunden", details: "Aktuelle Trello-Liste ist kein Rang (Name enthält keinen bekannten Rang)." },
      { status: 400 }
    );
  }

  // promote = higher rank => smaller index; demote => larger index
  const delta = direction === "promote" ? -1 : 1;
  const targetIdx = from.idx + delta;

  // UO limitation: only Rekrut -> PFC
  if (isUO && !(isAdmin || isFE)) {
    const ok = from.idx === rankOrder.indexOf("private rekrut") && targetIdx === rankOrder.indexOf("private first class");
    if (!ok) {
      return NextResponse.json({ error: "UO darf nur Private Rekrut → Private First Class befördern." }, { status: 403 });
    }
  }

  const to = ranked.find((l) => l.idx === targetIdx);
  if (!to) {
    return NextResponse.json(
      { error: "Ziel Rang nicht gefunden", details: `Kein Trello-Listeneintrag für Rangindex ${targetIdx}. Prüfe Listen-Namen/Existenz.` },
      { status: 400 }
    );
  }

  // Move card
  const moveUrl = `https://api.trello.com/1/cards/${cardId}?key=${key}&token=${token}`;
  const params = new URLSearchParams();
  params.set("idList", to.id);

  const moveRes = await fetch(moveUrl, {
    method: "PUT",
    headers: { "content-type": "application/x-www-form-urlencoded; charset=UTF-8" },
    body: params.toString(),
  });

  const moveText = await moveRes.text();
  let moveJson: any = null;
  try { moveJson = JSON.parse(moveText); } catch { /* ignore */ }

  if (!moveRes.ok) {
    return NextResponse.json({ error: "Trello move failed", status: moveRes.status, details: moveJson ?? moveText }, { status: 500 });
  }

  return NextResponse.json({ ok: true, moved: true, from: { id: from.id, name: from.name }, to: { id: to.id, name: to.name } });
}
