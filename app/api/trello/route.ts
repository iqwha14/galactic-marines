import { NextResponse } from "next/server";
import { requiredEnv, trelloBaseParams } from "../_lib/trello";

type TrelloList = { id: string; name: string };
type ChecklistItem = { id: string; name: string; state: "complete" | "incomplete" };
type TrelloChecklist = { id: string; name: string; checkItems: ChecklistItem[] };
type TrelloCard = {
  id: string;
  name: string;
  url: string;
  idList: string;
  idLabels?: string[];
  checklists?: TrelloChecklist[];
};

type TrelloLabel = { id: string; name: string };

const norm = (s: string) => (s ?? "").trim().toLowerCase();

function classifyChecklist(name: string): "trainings" | "medals" {
  const n = norm(name);
  if (n.includes("med") || n.includes("orden") || n.includes("award") || n.includes("auszeichnung")) return "medals";
  return "trainings";
}

/** Commander oben, Private unten. Major über Captain. */
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

function rankIndex(rankName: string): number {
  const r = norm(rankName);
  for (let i = 0; i < rankOrder.length; i++) if (r.includes(rankOrder[i])) return i;
  if (r.includes("private") || r.includes("rekrut")) return 10_000;
  return 5_000;
}

/** Unit labels */
const ELITE_LABELS = new Set([
  "galactic marine elite",
  "galactic marine elite leitung",
  "galactic marine elite stv. leitung",
  "galactic marine elite stv leitung",
  "galactic marine elite mitglied",
]);
const F44_LABELS = new Set([
  "44th leitung",
  "44th stv. leitung",
  "44th stv leitung",
  "44th mitglied",
]);

function unitGroupFromLabelNames(labelNames: string[]): { group: string; order: number } {
  const names = labelNames.map(norm);
  const hasElite = names.some((n) => ELITE_LABELS.has(n));
  const has44 = names.some((n) => F44_LABELS.has(n));
  if (hasElite) return { group: "Galactic Marine Elite", order: 1 };
  if (has44) return { group: "44th", order: 2 };
  return { group: "Haupteinheit", order: 0 };
}

/** Abmeldungen: alles was mit Abgemeldet beginnt */
function parseAbsenceFromLabelNames(labelNames: string[]) {
  const out: { label: string; from?: string; to?: string }[] = [];
  for (const raw of labelNames) {
    const name = (raw ?? "").trim();
    if (!name.toLowerCase().startsWith("abgemeldet")) continue;

    const rest = name.replace(/^abgemeldet\s*/i, "").trim();
    const tokens = rest
      .replace(/\s+bis\s+/gi, "-")
      .replace(/\s+to\s+/gi, "-")
      .split(/\s*[-–—]\s*/);

    const from = tokens[0]?.trim() || undefined;
    const to = tokens[1]?.trim() || undefined;
    out.push({ label: name, from, to });
  }
  return out;
}

const isProbablySoldierCard = (cardName: string) => {
  const n = (cardName ?? "").trim();
  if (/^\[[^\]]+\]/.test(n)) return true;
  if (n.includes("|")) return true;
  return false;
};

const isNonSoldierList = (rankOrListName: string) => {
  const r = norm(rankOrListName);
  return (
    r.includes("information") ||
    r.includes("vorlage") ||
    r.includes("slot") ||
    r.includes("partnereinheit") ||
    r.includes("einheitsjedi") ||
    r.includes("partner") ||
    r.includes("checklisten")
  );
};

async function fetchRankSinceMap(boardId: string, key: string, token: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const url = new URL(`https://api.trello.com/1/boards/${boardId}/actions`);
  url.searchParams.set("key", key);
  url.searchParams.set("token", token);
  url.searchParams.set("filter", "updateCard:idList");
  url.searchParams.set("limit", "1000");
  url.searchParams.set("fields", "date,data");

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) return map;
  const actions = (await res.json()) as any[];
  for (const a of actions) {
    const cardId = a?.data?.card?.id;
    const date = a?.date;
    if (!cardId || !date) continue;
    if (!map.has(String(cardId))) map.set(String(cardId), String(date));
  }
  return map;
}

export async function GET() {
  try {
    const boardId = requiredEnv("TRELLO_BOARD_ID");
    const { key, token } = trelloBaseParams();
    const adjListId = (process.env.TRELLO_ADJUTANT_LIST_ID ?? "").trim();
    const jediListId = (process.env.TRELLO_JEDI_LIST_ID ?? "").trim();

    // 1) Board labels (ID -> Name). This makes labels robust even if cards don't embed label objects.
    const labelsUrl = new URL(`https://api.trello.com/1/boards/${boardId}/labels`);
    labelsUrl.searchParams.set("key", key);
    labelsUrl.searchParams.set("token", token);
    labelsUrl.searchParams.set("limit", "1000");
    labelsUrl.searchParams.set("fields", "name");
    const labelsRes = await fetch(labelsUrl.toString(), { cache: "no-store" });
    const boardLabels = (labelsRes.ok ? ((await labelsRes.json()) as TrelloLabel[]) : []) ?? [];
    const labelIdToName = new Map(boardLabels.map((l) => [l.id, l.name]));

    // 2) Lists
    const listsUrl = new URL(`https://api.trello.com/1/boards/${boardId}/lists`);
    listsUrl.searchParams.set("key", key);
    listsUrl.searchParams.set("token", token);
    listsUrl.searchParams.set("fields", "name");
    const listsRes = await fetch(listsUrl.toString(), { cache: "no-store" });
    if (!listsRes.ok) {
      const text = await listsRes.text();
      return NextResponse.json({ error: "Trello lists request failed", status: listsRes.status, details: text }, { status: 500 });
    }
    const lists = (await listsRes.json()) as TrelloList[];
    const listIdToRank = new Map(lists.map((l) => [l.id, l.name]));

    // 3) Cards (we primarily need idLabels; checklists included)
    const cardsUrl = new URL(`https://api.trello.com/1/boards/${boardId}/cards`);
    cardsUrl.searchParams.set("key", key);
    cardsUrl.searchParams.set("token", token);
    cardsUrl.searchParams.set("fields", "name,url,idList,idLabels");
    cardsUrl.searchParams.set("checklists", "all");
    cardsUrl.searchParams.set("checklist_fields", "name,checkItems");
    cardsUrl.searchParams.set("checkItem_fields", "name,state");
    // Explicitly ask Trello to also include labels in case it can (not required though).
    cardsUrl.searchParams.set("labels", "none");

    const cardsRes = await fetch(cardsUrl.toString(), { cache: "no-store" });
    if (!cardsRes.ok) {
      const text = await cardsRes.text();
      return NextResponse.json({ error: "Trello cards request failed", status: cardsRes.status, details: text }, { status: 500 });
    }
    const cards = (await cardsRes.json()) as TrelloCard[];

    // 4) Rank since
    const rankSinceMap = await fetchRankSinceMap(boardId, key, token);

    const raw = cards.map((c) => {
      const rank = listIdToRank.get(c.idList) ?? "Unknown";

      const labelNames = (c.idLabels ?? []).map((id) => labelIdToName.get(id) ?? "").filter(Boolean);

      const trainings: ChecklistItem[] = [];
      const medals: ChecklistItem[] = [];
      for (const cl of c.checklists ?? []) {
        const bucket = classifyChecklist(cl.name);
        for (const it of cl.checkItems ?? []) {
          const item: ChecklistItem = { id: it.id, name: it.name.trim(), state: it.state };
          if (!item.name) continue;
          (bucket === "trainings" ? trainings : medals).push(item);
        }
      }
      trainings.sort((a, b) => a.name.localeCompare(b.name, "de"));
      medals.sort((a, b) => a.name.localeCompare(b.name, "de"));

      const unit = unitGroupFromLabelNames(labelNames);
      const absences = parseAbsenceFromLabelNames(labelNames);

      return {
        id: c.id,
        name: c.name,
        url: c.url,
        idList: c.idList,
        rank,
        rankSince: rankSinceMap.get(c.id) ?? null,
        unitGroup: unit.group,
        unitOrder: unit.order,
        absences,
        trainings,
        medals,
        _labelNames: labelNames,
      };
    });

    const isSoldier = (m: any) => {
      // Jedi/Adjutanten sollen wie normale Soldaten behandelt werden,
      // auch wenn der Listenname sonst als Nicht-Soldat erkannt wird.
      if (jediListId && m.idList === jediListId) {
        const hasAnyChecklist = (m.trainings?.length ?? 0) > 0 || (m.medals?.length ?? 0) > 0;
        return isProbablySoldierCard(m.name) || hasAnyChecklist;
      }
      if (adjListId && m.idList === adjListId) {
        const hasAnyChecklist = (m.trainings?.length ?? 0) > 0 || (m.medals?.length ?? 0) > 0;
        return isProbablySoldierCard(m.name) || hasAnyChecklist;
      }

      if (isNonSoldierList(m.rank)) return false;
      const hasAnyChecklist = (m.trainings?.length ?? 0) > 0 || (m.medals?.length ?? 0) > 0;
      return isProbablySoldierCard(m.name) || hasAnyChecklist;
    };

    // Roster
    let marines = raw.filter((m) => {
      if (adjListId && m.idList === adjListId) return false;
      if (jediListId && m.idList === jediListId) return false;
      return isSoldier(m);
    });

    marines.sort((a, b) => {
      const ai = rankIndex(a.rank);
      const bi = rankIndex(b.rank);
      if (ai !== bi) return ai - bi;
      return a.name.localeCompare(b.name, "de");
    });

    const ranks = [...new Set(marines.map((m) => m.rank))].sort((a, b) => {
      const ai = rankIndex(a);
      const bi = rankIndex(b);
      if (ai !== bi) return ai - bi;
      return a.localeCompare(b, "de");
    });

    const listsSorted = [...lists].sort((a, b) => {
      const ai = rankIndex(a.name);
      const bi = rankIndex(b.name);
      if (ai !== bi) return ai - bi;
      return a.name.localeCompare(b.name, "de");
    });

    const trainingNames = new Set<string>();
    const medalNames = new Set<string>();
    for (const m of marines) {
      for (const t of m.trainings) trainingNames.add(t.name);
      for (const md of m.medals) medalNames.add(md.name);
    }

    const adjutantCards = adjListId ? raw.filter((m) => m.idList === adjListId).filter(isSoldier) : [];
    const jediCards = jediListId ? raw.filter((m) => m.idList === jediListId).filter(isSoldier) : [];


    const absent = raw
      .filter(isSoldier)
      .filter((m) => (m.absences?.length ?? 0) > 0)
      .map((m) => ({
        id: m.id,
        name: m.name,
        url: m.url,
        rank: m.rank,
        unitGroup: m.unitGroup,
        absences: m.absences,
      }))
      .sort((a, b) => {
        if (a.unitGroup !== b.unitGroup) return String(a.unitGroup).localeCompare(String(b.unitGroup), "de");
        const ai = rankIndex(a.rank);
        const bi = rankIndex(b.rank);
        if (ai !== bi) return ai - bi;
        return a.name.localeCompare(b.name, "de");
      });

    const marinesPublic = marines.map(({ idList, unitOrder, _labelNames, ...rest }: any) => rest);
    const adjPublic = adjutantCards.map(({ idList, unitOrder, _labelNames, ...rest }: any) => rest);
    const jediPublic = jediCards.map(({ idList, unitOrder, _labelNames, ...rest }: any) => rest);

    // Debug block: helps verify labels are read (keep small)
    const debug = {
      boardLabels: boardLabels.slice(0, 10),
      sampleCardLabels: raw.slice(0, 5).map((m) => ({ name: m.name, labels: m._labelNames })),
    };

    return NextResponse.json({
      marines: marinesPublic,
      ranks,
      lists: listsSorted,
      trainings: [...trainingNames].sort((a, b) => a.localeCompare(b, "de")),
      medals: [...medalNames].sort((a, b) => a.localeCompare(b, "de")),
      adjutantListId: adjListId || null,
      adjutantCards: adjPublic,
      jediListId: jediListId || null,
      jediCards: jediPublic,
      absent,
      debug,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
