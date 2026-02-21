import { NextResponse } from "next/server";
import { requireFE } from "@/lib/authz";

const DOC_ID = (process.env.GM_FE_DOC_ID ?? "").trim();

function stripUnsafe(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/<link[^>]*>/gi, "")
    .replace(/<meta[^>]*>/gi, "");
}

export async function POST() {
  const gate = await requireFE();
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  if (!DOC_ID) {
    return NextResponse.json(
      { error: "Missing env var: GM_FE_DOC_ID", hint: "GM_FE_DOC_ID = Google Doc ID (zwischen /d/ und /edit)." },
      { status: 500 }
    );
  }

  const url = `https://docs.google.com/document/d/${DOC_ID}/export?format=html`;
  const res = await fetch(url, { cache: "no-store" });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return NextResponse.json(
      {
        error: "Google Doc export failed",
        status: res.status,
        details: text.slice(0, 400),
        hint: "Google Doc muss auf 'Jeder mit Link: Betrachter' stehen.",
      },
      { status: 500 }
    );
  }

  const raw = await res.text();
  const clean = stripUnsafe(raw);

  const wrapped = `<!doctype html>
<html><head><meta charset="utf-8"><title>Führungsebene Dokument</title></head>
<body style="margin:0;padding:24px;background:#0b0f14;color:#e6eef6;font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,Noto Sans,sans-serif;">
<div style="max-width:900px;margin:0 auto;">${clean}</div>
</body></html>`;

  return NextResponse.json({ ok: true, html: wrapped });
}
