import { NextResponse } from "next/server";
import { requiredEnv, trelloBaseParams } from "../_lib/trello";
import { requireEditor } from "@/lib/authz";

type TrelloAction = {
  id: string;
  type: string;
  date: string;
  memberCreator?: { fullName?: string; username?: string };
  data?: any;
};

const fmtWho = (a: TrelloAction) =>
  a.memberCreator?.fullName || a.memberCreator?.username || "Unknown";

export async function GET(req: Request) {
  // Zugriffsschutz (Editors/Admins)
  const gate = await requireEditor(req);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error || "Access denied" }, { status: gate.status });
  }

  try {
    const boardId = requiredEnv("TRELLO_BOARD_ID");
    const { key, token } = trelloBaseParams();

    const url = new URL(`https://api.trello.com/1/boards/${boardId}/actions`);
    url.searchParams.set("key", key);
    url.searchParams.set("token", token);
    url.searchParams.set("limit", "200");
    url.searchParams.set("filter", "updateCard,updateCheckItemStateOnCard,createCard,commentCard");
    url.searchParams.set("fields", "type,date,data,memberCreator");

    const res = await fetch(url.toString(), { next: { revalidate: 10 } });
    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: "Trello actions request failed", status: res.status, details: text },
        { status: 500 }
      );
    }

    const actions = (await res.json()) as TrelloAction[];

    // Normalisiere auf ein einheitliches "logs" Format für die UI
    const logs = actions.map((a) => {
      const who = fmtWho(a);
      const when = a.date;
      const t = a.type;
      const d = a.data || {};
      const cardName = d.card?.name || d.card?.id || "Card";

      let title = `${cardName}: ${t}`;
      let kind = "other";

      if (t === "updateCard" && d.listBefore && d.listAfter) {
        kind = "promotion";
        title = `${cardName}: ${d.listBefore.name} → ${d.listAfter.name}`;
      } else if (t === "updateCheckItemStateOnCard" && d.checkItem) {
        kind = "checkitem";
        title = `${cardName}: ${d.checkItem.name} → ${d.checkItem.state}`;
      } else if (t === "createCard") {
        kind = "create";
        title = `Neue Karte: ${cardName}`;
      } else if (t === "commentCard" && d.text) {
        kind = "comment";
        title = `${cardName}: Kommentar`;
      }

      return {
        id: a.id,
        created_at: when,
        action: title,          // das zeigt die UI fett
        event: kind,            // kleine Zusatzinfo
        actor: who,
        meta: {
          source: "trello",
          trello_action_id: a.id,
          trello_type: t,
          kind,
          card: d.card ?? null,
          listBefore: d.listBefore ?? null,
          listAfter: d.listAfter ?? null,
          checkItem: d.checkItem ?? null,
        },
      };
    });

    return NextResponse.json({ logs });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}