import { NextResponse } from "next/server";
import { requiredEnv, trelloBaseParams } from "../../_lib/trello";
import { requireSignedIn } from "@/lib/authz";
import { sendDiscordPromotionEmbed } from "../../_lib/discord";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const norm = (s: string) =>
  (s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

type RankDef = { key: string; order: number; aliases: string[] };

// Lowest -> Highest
const RANKS: RankDef[] = [
  // Enlisted
  {
    key: "private_rekrut",
    order: 0,
    aliases: [
      "private rekrut",
      "pvt rekrut",
      "pvt. rekrut",
      "pr",
      "rekrut",
      "rek",
      "recruit",
      "recr",
    ],
  },
  {
    key: "private",
    order: 1,
    aliases: ["private", "pvt", "pvt."],
  },
  {
    key: "private_first_class",
    order: 2,
    aliases: [
      "private first class",
      "private 1st class",
      "pfc",
      "pvt first class",
      "pvt. first class",
      "pvt 1st class",
      "pvt. 1st class",
      "private firstclass",
    ],
  },
  { key: "lance_corporal", order: 3, aliases: ["lance corporal", "lance cpl", "lcpl", "l/cpl"] },
  { key: "corporal", order: 4, aliases: ["corporal", "cpl", "kpl", "korporal"] },
  { key: "sergeant", order: 5, aliases: ["sergeant", "sgt", "sgt.", "srg"] },
  { key: "staff_sergeant", order: 6, aliases: ["staff sergeant", "staff sgt", "ssgt", "ssgt."] },
  { key: "sergeant_major", order: 7, aliases: ["sergeant major", "sgt major", "sgt. major", "sgmaj", "sg maj"] },

  // Officers
  { key: "lieutenant", order: 8, aliases: ["lieutenant", "lt", "lt.", "leutnant"] },
  {
    key: "first_lieutenant",
    order: 9,
    aliases: ["first lieutenant", "1st lieutenant", "1st lt", "1st lt.", "1. lt", "1. lt."],
  },
  { key: "captain", order: 10, aliases: ["captain", "capt", "cpt", "cpt.", "hauptmann"] },
  { key: "major", order: 11, aliases: ["major", "maj", "maj."] },
  { key: "commander", order: 12, aliases: ["commander", "cmdr", "cmdr.", "kommandeur"] },
];

function resolveRank(listName: string): RankDef | null {
  const n = norm(listName);
  if (!n) return null;

  // 1) Exact matches first
  for (const r of RANKS) {
    for (const a of r.aliases) {
      if (n === norm(a)) return r;
    }
  }

  // 2) Word-boundary contains, preferring the LONGEST alias (prevents Major matching Sergeant Major)
  let best: { r: RankDef; len: number } | null = null;
  for (const r of RANKS) {
    for (const a of r.aliases) {
      const an = norm(a);
      if (!an) continue;
      const re = new RegExp(`(^|\\s)${an.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}(\\s|$)`);
      if (re.test(n)) {
        const len = an.length;
        if (!best || len > best.len) best = { r, len };
      }
    }
  }

  return best?.r ?? null;
}

type TrelloList = { id: string; name: string };

type TrelloCard = { idList?: string; name?: string };

async function fetchJson(url: string) {
  const res = await fetch(url, { cache: "no-store" });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* ignore */
  }
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
  if (!['promote', 'demote'].includes(direction)) {
    return NextResponse.json({ error: "direction must be promote|demote" }, { status: 400 });
  }

  // Permissions
  if (!(isAdmin || isFE || isUO)) return NextResponse.json({ error: "Access denied" }, { status: 403 });

  const { key, token } = trelloBaseParams();
  const boardId = requiredEnv("TRELLO_BOARD_ID");

  // Read card current list + name
  const cardUrl = `https://api.trello.com/1/cards/${cardId}?key=${key}&token=${token}&fields=idList,name`;
  const cardResp = await fetchJson(cardUrl);
  if (!cardResp.res.ok) {
    return NextResponse.json(
      { error: "Trello card read failed", status: cardResp.res.status, details: cardResp.json ?? cardResp.text },
      { status: 500 }
    );
  }

  const card = (cardResp.json ?? {}) as TrelloCard;
  const fromListId = String(card.idList ?? "");
  const cardName = String(card.name ?? "Unbekannt");
  if (!fromListId) return NextResponse.json({ error: "Cannot resolve current list" }, { status: 500 });

  // Get all lists on board
  const listsUrl = `https://api.trello.com/1/boards/${boardId}/lists?key=${key}&token=${token}&fields=name`;
  const listsResp = await fetchJson(listsUrl);
  if (!listsResp.res.ok) {
    return NextResponse.json(
      { error: "Trello lists read failed", status: listsResp.res.status, details: listsResp.json ?? listsResp.text },
      { status: 500 }
    );
  }

  const lists = (Array.isArray(listsResp.json) ? listsResp.json : []) as TrelloList[];

  const ranked = lists
    .map((l) => {
      const r = resolveRank(l.name);
      return r
        ? {
            id: l.id,
            name: l.name,
            rankKey: r.key,
            order: r.order,
          }
        : null;
    })
    .filter(Boolean) as Array<{ id: string; name: string; rankKey: string; order: number }>;

  const from = ranked.find((l) => l.id === fromListId);
  if (!from) {
    const fromListName = lists.find((l) => l.id === fromListId)?.name ?? "(unbekannt)";
    return NextResponse.json(
      {
        error: "Ziel Rang nicht gefunden",
        details:
          "Aktuelle Trello-Liste ist kein erkannter Rang. Prüfe den Listen-Namen (Emojis/Abkürzungen werden unterstützt, aber der Rang muss im Namen erkennbar sein).",
        debug: { fromListId, fromListName, cardName },
      },
      { status: 400 }
    );
  }

  const delta = direction === "promote" ? +1 : -1;
  const targetOrder = from.order + delta;

  // UO limitation: only Rekrut -> PFC (wie vorher)
  if (isUO && !(isAdmin || isFE)) {
    const ok = from.rankKey === "private_rekrut" && targetOrder === RANKS.find((r) => r.key === "private_first_class")?.order;
    if (!ok) {
      return NextResponse.json(
        { error: "UO darf nur Private Rekrut → Private First Class befördern." },
        { status: 403 }
      );
    }
  }

  // Target list: choose list that resolves exactly to that order.
  // If multiple (shouldn't happen), prefer exact normalized match with canonical alias.
  const candidates = ranked.filter((l) => l.order === targetOrder);
  if (!candidates.length) {
    const expected = RANKS.find((r) => r.order === targetOrder)?.aliases?.[0] ?? `order ${targetOrder}`;
    return NextResponse.json(
      {
        error: "Ziel Rang nicht gefunden",
        details: `Kein Trello-Listeneintrag für Zielrang (${expected}). Prüfe ob die Liste existiert und korrekt benannt ist.`,
        debug: {
          from: { id: from.id, name: from.name, order: from.order, rankKey: from.rankKey },
          targetOrder,
          expected,
        },
      },
      { status: 400 }
    );
  }

  // Prefer best match if there are multiple lists with same order.
  const canonical = (RANKS.find((r) => r.order === targetOrder)?.aliases?.[0] ?? "").toLowerCase();
  const to =
    candidates.find((c) => norm(c.name) === norm(canonical)) ??
    candidates.find((c) => norm(c.name).includes(norm(canonical))) ??
    candidates[0];

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
  try {
    moveJson = JSON.parse(moveText);
  } catch {
    /* ignore */
  }

  if (!moveRes.ok) {
    return NextResponse.json(
      { error: "Trello move failed", status: moveRes.status, details: moveJson ?? moveText },
      { status: 500 }
    );
  }

  // Discord webhook (best-effort)
  await sendDiscordPromotionEmbed({
    kind: direction === "promote" ? "promotion" : "demotion",
    name: cardName,
    oldRank: from.name,
    newRank: to.name,
    actor: gate.session?.name || gate.session?.discordId,
  });

  return NextResponse.json({
    ok: true,
    moved: true,
    from: { id: from.id, name: from.name },
    to: { id: to.id, name: to.name },
  });
}
