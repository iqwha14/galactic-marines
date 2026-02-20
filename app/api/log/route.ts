import { NextResponse } from "next/server";
import { requiredEnv, trelloBaseParams } from "../_lib/trello";

type TrelloAction = {
  id: string;
  type: string;
  date: string;
  memberCreator?: { fullName?: string; username?: string };
  data?: any;
};

const fmtWho = (a: TrelloAction) =>
  a.memberCreator?.fullName || a.memberCreator?.username || "Unknown";

export async function GET() {
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
      return NextResponse.json({ error: "Trello actions request failed", status: res.status, details: text }, { status: 500 });
    }

    const actions = (await res.json()) as TrelloAction[];

    const entries = actions.map((a) => {
      const who = fmtWho(a);
      const when = a.date;
      const t = a.type;
      const d = a.data || {};
      const cardName = d.card?.name || d.card?.id || "Card";

      // Promotions: updateCard with listBefore/listAfter
      if (t === "updateCard" && d.listBefore && d.listAfter) {
        return {
          id: a.id,
          when,
          who,
          kind: "promotion",
          title: `${cardName}: ${d.listBefore.name} → ${d.listAfter.name}`,
        };
      }

      // Training/medal checks: updateCheckItemStateOnCard
      if (t === "updateCheckItemStateOnCard" && d.checkItem) {
        const state = d.checkItem.state;
        return {
          id: a.id,
          when,
          who,
          kind: "checkitem",
          title: `${cardName}: ${d.checkItem.name} → ${state}`,
        };
      }

      if (t === "createCard") {
        return { id: a.id, when, who, kind: "create", title: `Neue Karte: ${cardName}` };
      }

      if (t === "commentCard" && d.text) {
        return { id: a.id, when, who, kind: "comment", title: `${cardName}: Kommentar` };
      }

      return { id: a.id, when, who, kind: "other", title: `${cardName}: ${t}` };
    });

    return NextResponse.json({ entries });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
