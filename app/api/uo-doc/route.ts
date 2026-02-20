import { NextResponse } from "next/server";
import { requireUO } from "@/lib/authz";

const DOC_ID = "1H-MjTxVkHPCrqzGwXv6UK4ys25pap0vW0UlP1JyVxfE";

function stripUnsafe(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/<link[^>]*>/gi, "")
    .replace(/<meta[^>]*>/gi, "");
}

export async function POST() {
  const gate = await requireUO();
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  // Public export: requires the doc to be shared as "Anyone with the link can view"
  const url = `https://docs.google.com/document/d/${DOC_ID}/export?format=html`;
  const res = await fetch(url, { cache: "no-store" });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return NextResponse.json(
      {
        error: "Google Doc export failed",
        status: res.status,
        details: text.slice(0, 400),
        hint:
          "Stell das Google Doc auf 'Jeder mit dem Link: Betrachter'. Private Docs können ohne Google API/Service Account nicht exportiert werden.",
      },
      { status: 500 }
    );
  }

  const raw = await res.text();
  const clean = stripUnsafe(raw);

  const wrapped = `<!doctype html>
<html>
<head><meta charset="utf-8"><title>Unteroffiziersdokument</title></head>
<body style="margin:0;padding:24px;background:#0b0f14;color:#e6eef6;font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,Noto Sans,sans-serif;">
<div style="max-width:900px;margin:0 auto;">${clean}</div>
</body></html>`;

  return NextResponse.json({ ok: true, html: wrapped });
}
