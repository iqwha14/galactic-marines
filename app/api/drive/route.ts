
import { NextResponse } from "next/server";

type Item = { id: string; name: string };

function extractItems(html: string): Item[] {
  const items: Item[] = [];

  // Pattern 1: Google Drive file links
  const regex = /\/file\/d\/([a-zA-Z0-9_-]{20,})/g;
  const seen = new Set<string>();

  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    const id = match[1];
    if (!seen.has(id)) {
      seen.add(id);
      items.push({ id, name: "Dokument " + id.slice(0, 6) });
    }
  }

  return items;
}

export async function GET() {
  const folderId = process.env.GM_DRIVE_FOLDER_ID;

  if (!folderId) {
    return NextResponse.json(
      { error: "Missing GM_DRIVE_FOLDER_ID" },
      { status: 500 }
    );
  }

  try {
    const url = `https://drive.google.com/drive/folders/${folderId}`;
    const res = await fetch(url, { cache: "no-store" });

    if (!res.ok) {
      return NextResponse.json(
        { error: "Drive fetch failed", status: res.status },
        { status: 500 }
      );
    }

    const html = await res.text();
    const items = extractItems(html);

    return NextResponse.json({ ok: true, items });
  } catch (e: any) {
    return NextResponse.json(
      { error: "Server error", details: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
