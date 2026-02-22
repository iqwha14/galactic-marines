import { NextResponse } from "next/server";
import { requireSignedIn } from "@/lib/authz";
import { trelloBaseParams } from "../../_lib/trello";
import { sendDiscordMedalEmbed, sendDiscordTrainingEmbed } from "../../_lib/discord";

const norm = (s: string) => (s ?? "").trim().toLowerCase();

function classifyChecklist(name: string): "trainings" | "medals" {
  const n = norm(name);
  if (n.includes("med") || n.includes("orden") || n.includes("award") || n.includes("auszeichnung")) return "medals";
  return "trainings";
}

type ChecklistItem = { id: string; name: string; state: "complete" | "incomplete" };
type TrelloChecklist = { id: string; name: string; checkItems: ChecklistItem[] };
type TrelloCard = { id: string; name: string; checklists?: TrelloChecklist[] };

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

  // Discord webhook (best-effort)
  try {
    // Resolve card + check item name
    const cardUrl = new URL(`https://api.trello.com/1/cards/${cardId}`);
    cardUrl.searchParams.set("key", key);
    cardUrl.searchParams.set("token", token);
    cardUrl.searchParams.set("fields", "name");
    cardUrl.searchParams.set("checklists", "all");
    cardUrl.searchParams.set("checklist_fields", "name,checkItems");
    cardUrl.searchParams.set("checkItem_fields", "name,state");

    const cardRes = await fetch(cardUrl.toString(), { cache: "no-store" });
    const cardText = await cardRes.text();
    let cardJson: any = null;
    try {
      cardJson = JSON.parse(cardText);
    } catch {
      cardJson = null;
    }

    if (cardRes.ok && cardJson) {
      const card = cardJson as TrelloCard;
      const traineeName = String(card?.name ?? "").trim() || "Unbekannt";

      let checklistName = "";
      let itemName = "";

      for (const cl of (card.checklists ?? []) as any[]) {
        const items = Array.isArray(cl?.checkItems) ? cl.checkItems : [];
        const found = items.find((it: any) => String(it?.id ?? "") === checkItemId);
        if (found) {
          checklistName = String(cl?.name ?? "");
          itemName = String(found?.name ?? "");
          break;
        }
      }

      const actorPretty = gate.session?.name?.trim() || (gate.session?.discordId ? `<@${gate.session.discordId}>` : "Unbekannt");

      const bucket = classifyChecklist(checklistName);
      const isComplete = state === "complete";

      if (bucket === "medals") {
        await sendDiscordMedalEmbed({
          action: isComplete ? "awarded" : "reverted",
          medalName: itemName || "Unbekannt",
          giverName: actorPretty,
          receiverName: traineeName,
        });
      } else {
        await sendDiscordTrainingEmbed({
          action: isComplete ? "completed" : "reverted",
          trainingName: itemName || "Unbekannt",
          instructorName: actorPretty,
          traineeName,
        });
      }
    }
  } catch {
    // ignore
  }

  return NextResponse.json({ ok: true });
}
