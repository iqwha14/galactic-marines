import { NextResponse } from "next/server";

type Item = { id: string; name: string };

function uniqById(items: Item[]): Item[] {
  const seen = new Set<string>();
  const out: Item[] = [];
  for (const it of items) {
    if (!it?.id || seen.has(it.id)) continue;
    seen.add(it.id);
    out.push(it);
  }
  return out;
}

function extractItems(html: string): Item[] {
  const items: Item[] = [];

  // Pattern A: file links in HTML (id only)
  const idRe = /\/file\/d\/([a-zA-Z0-9_-]{20,})/g;
  let m: RegExpExecArray | null;
  while ((m = idRe.exec(html)) !== null) {
    items.push({ id: m[1], name: "Dokument" });
  }

  // Pattern B: aria-label often contains file name and link contains id
  // Example fragments differ frequently; we do best-effort:
  const ariaRe = /aria-label=\"([^\"]+)\"[\s\S]{0,200}?\/file\/d\/([a-zA-Z0-9_-]{20,})/g;
  while ((m = ariaRe.exec(html)) !== null) {
    const name = m[1];
    const id = m[2];
    items.push({ id, name });
  }

  // Pattern C: data-id + title/name hints (fallback)
  const dataIdRe = /data-id=\"([a-zA-Z0-9_-]{20,})\"[\s\S]{0,120}?(?:data-tooltip=\"([^\"]+)\"|title=\"([^\"]+)\")/g;
  while ((m = dataIdRe.exec(html)) !== null) {
    const id = m[1];
    const name = (m[2] || m[3] || "Dokument").trim();
    items.push({ id, name });
  }

  const cleaned = items.map((it) => ({
    id: it.id,
    name: (it.name || "Dokument").replace(/\s+/g, " ").trim(),
  }));

  // Filter out obvious junk tokens
  const filtered = cleaned.filter((it) => it.name.length > 1 && !/awaitelements|blobcomments|svwoff/i.test(it.name));

  return uniqById(filtered).slice(0, 200);
}

export async function GET() {
  const folderId = (process.env.GM_DRIVE_FOLDER_ID ?? "").trim();
  if (!folderId) return NextResponse.json({ error: "Missing env var: GM_DRIVE_FOLDER_ID" }, { status: 500 });

  try {
    const url = `https://drive.google.com/drive/folders/${folderId}`;
    const res = await fetch(url, { cache: "no-store" });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return NextResponse.json(
        { error: "Drive fetch failed", status: res.status, details: text.slice(0, 300) },
        { status: 500 }
      );
    }

    const html = await res.text();
    const items = extractItems(html);

    return NextResponse.json({
      ok: true,
      items,
      warning: items.length ? null : "Keine Dateien gefunden. Prüfe: Ordner ist 'Jeder mit Link: Betrachter'.",
    });
  } catch (e: any) {
    return NextResponse.json({ error: "Server error", details: e?.message ?? String(e) }, { status: 500 });
  }
}
