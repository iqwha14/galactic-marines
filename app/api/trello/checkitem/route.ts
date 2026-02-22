import { NextResponse } from "next/server";
import { requireSignedIn } from "@/lib/authz";
import { trelloBaseParams } from "../../_lib/trello";
import { sendDiscordMedalEmbed, sendDiscordTrainingEmbed } from "../../_lib/discord";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

function norm(s: string) {
  return (s ?? "").toLowerCase().trim();
}

function looksLikeMedal(checklistName: string, itemName: string) {
  const n = `${checklistName} ${itemName}`.toLowerCase();
  return n.includes("medaille") || n.includes("medal") || n.includes("orden") || n.includes("award");
}

export async function POST(req: Request) {
  const gate = await requireSignedIn(req);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const canToggle = !!(gate.session?.canSeeFE || gate.session?.canSeeUO || gate.session?.isAdmin);
  if (!canToggle) return NextResponse.json({ error: "Access denied" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const cardId = String(body?.cardId ?? "");
  const checkItemId = String(body?.checkItemId ?? "");
  const state = String(body?.state ?? "");

  if (!cardId || !checkItemId || (state !== "complete" && state !== "incomplete")) {
    return NextResponse.json({ error: "Missing/invalid fields" }, { status: 400 });
  }

  const { key, token } = trelloBaseParams();

  // 1) Toggle checkitem state
  const putUrl = new URL(`https://api.trello.com/1/cards/${cardId}/checkItem/${checkItemId}`);
  putUrl.searchParams.set("key", key);
  putUrl.searchParams.set("token", token);
  putUrl.searchParams.set("state", state);

  const putRes = await fetch(putUrl.toString(), { method: "PUT" });
  const putText = await putRes.text();
  let putJson: any = null;
  try {
    putJson = JSON.parse(putText);
  } catch {
    /* ignore */
  }

  if (!putRes.ok) {
    return NextResponse.json(
      { error: "Trello update failed", status: putRes.status, details: putJson ?? putText },
      { status: 500 }
    );
  }

  // 2) Resolve names for embed (best-effort)
  const actor = gate.session?.name || gate.session?.discordId || "Unbekannt";

  // Card name (trainee/recipient)
  let cardName = "Unbekannt";
  const cardInfoUrl = `https://api.trello.com/1/cards/${cardId}?key=${key}&token=${token}&fields=name`;
  const cardInfo = await fetchJson(cardInfoUrl);
  if (cardInfo.res.ok) cardName = String(cardInfo.json?.name ?? cardName);

  // CheckItem name + checklist
  let itemName = "Unbekannt";
  let checklistId = "";
  if (putJson && typeof putJson === "object") {
    itemName = String(putJson?.name ?? itemName);
    checklistId = String(putJson?.idChecklist ?? "");
  }

  // If PUT response didn't contain details, try to fetch item
  if (itemName === "Unbekannt" || !checklistId) {
    const itemUrl = `https://api.trello.com/1/cards/${cardId}/checkItem/${checkItemId}?key=${key}&token=${token}`;
    const itemResp = await fetchJson(itemUrl);
    if (itemResp.res.ok) {
      itemName = String(itemResp.json?.name ?? itemName);
      checklistId = String(itemResp.json?.idChecklist ?? checklistId);
    }
  }

  let checklistName = "";
  if (checklistId) {
    const clUrl = `https://api.trello.com/1/checklists/${checklistId}?key=${key}&token=${token}&fields=name`;
    const clResp = await fetchJson(clUrl);
    if (clResp.res.ok) checklistName = String(clResp.json?.name ?? "");
  }

  const isMedal = looksLikeMedal(checklistName, itemName);

  // 3) Send Discord embed (best-effort)
  if (isMedal) {
    await sendDiscordMedalEmbed({
      action: state === "complete" ? "awarded" : "revoked",
      medalName: itemName,
      actor,
      recipient: cardName,
    });
  } else {
    await sendDiscordTrainingEmbed({
      action: state === "complete" ? "completed" : "reverted",
      trainingName: itemName,
      instructor: actor,
      trainee: cardName,
    });
  }

  return NextResponse.json({ ok: true });
}
