"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { HudCard, TopBar } from "@/app/_components/Hud";

export default function UODocPage() {
  const [html, setHtml] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const res = await fetch("/api/uo-doc", { method: "POST" });
        const text = await res.text();
        const json = (() => { try { return JSON.parse(text); } catch { return null; } })();
        if (!res.ok) throw new Error(json?.error || json?.details || text || `Request failed (${res.status})`);
        if (alive) setHtml(json?.html ?? null);
      } catch (e: any) {
        if (alive) setErr(e?.message ?? String(e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  return (
    <main className="min-h-screen hud-grid px-6 py-10">
      <div className="mx-auto max-w-6xl">
        <TopBar title="Unteroffiziersdokument" subtitle="ARCHIVE / UO" right={<Link href="/documents" className="btn btn-ghost">← Dokumente</Link>} />
        <HudCard title="Dokument">
          {loading ? <div className="text-hud-muted">Lade…</div> : null}
          {err ? (
            <div className="rounded-xl border border-marine-500/40 bg-marine-500/10 p-4 text-sm">
              <div className="font-medium">Zugriff/Fehler</div>
              <div className="mt-1 text-hud-muted">{err}</div>
            </div>
          ) : null}
          {html ? (
            <iframe className="mt-4 h-[70vh] w-full rounded-xl border border-hud-line/70 bg-black" sandbox="allow-same-origin" srcDoc={html} />
          ) : null}
        </HudCard>
      </div>
    </main>
  );
}
