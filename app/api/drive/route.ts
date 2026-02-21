import { NextResponse } from "next/server";

/**
 * Best-effort public Google Drive folder listing by scraping the public folder page.
 * This works for many "Anyone with the link can view" folders.
 *
 * Env:
 * - GM_DRIVE_FOLDER_ID (optional) override
 */
const FALLBACK_FOLDER_URL =
  "https://drive.google.com/drive/folders/1EHiuwPpPLBC-Ti9xCNUnijyFxzVbwwTH?usp=sharing";

function extractFolderId(url: string) {
  const m = url.match(/folders\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

type Item = { id: string; name: string; mime?: string };

export async function GET() {
  try {
    const folderId = (process.env.GM_DRIVE_FOLDER_ID ?? extractFolderId(FALLBACK_FOLDER_URL) ?? "").trim();
    if (!folderId) return NextResponse.json({ items: [], warning: "Missing folder id" });

    const url = `https://drive.google.com/drive/folders/${folderId}?usp=sharing`;
    const res = await fetch(url, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
      },
      cache: "no-store",
    });

    if (!res.ok) {
      return NextResponse.json({ items: [], warning: `Drive fetch failed: ${res.status}` });
    }

    const html = await res.text();

    // Heuristic: find file entries:
    // Pattern A: ["<id>","<name>", ...]
 ["<id>","<name>", ...]
    // We'll collect (id,name) pairs where id looks like a drive file id and name has an extension or spaces.
    const items: Item[] = [];

    // Pattern B: data-id="FILEID" ... aria-label="FILENAME"
    const reB = /data-id="([a-zA-Z0-9_-]{20,})"[\s\S]{0,260}?aria-label="([^"]{1,200})"/g;
    let mb: RegExpExecArray | null;
    while ((mb = reB.exec(html))) {
      const id = mb[1];
      const name = mb[2].replace(/\s+/g, " ").trim();
      if (id && name && !items.find((x) => x.id === id)) items.push({ id, name });
    }

    const re = /\["([a-zA-Z0-9_-]{10,})","([^"]{1,120})"/g;
    let m: RegExpExecArray | null;
    const seen = new Set<string>();
    while ((m = re.exec(html))) {
      const id = m[1];
      const name = m[2];
      if (seen.has(id)) continue;
      if (!name || name.toLowerCase().includes("untitled")) continue;
      // crude filter: ignore obvious non-filenames
      if (name.length < 2) continue;
      // Keep
      seen.add(id);
      items.push({ id, name });
      if (items.length > 300) break;
    }

    // Sort nicely
    items.sort((a, b) => a.name.localeCompare(b.name, "de"));

    return NextResponse.json({
      folderId,
      folderUrl: url,
      items,
      warning: items.length ? null : "Konnte keine Dateien automatisch auslesen. Prüfe Freigabe: 'Jeder mit Link'.",
    });
  } catch (e: any) {
    return NextResponse.json({ items: [], warning: e?.message ?? "Drive error" });
  }
}
