"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { HudCard, TopBar } from "@/app/_components/Hud";

type DriveItem = { id: string; name: string };

export default function DocumentsPage() {
  const [items, setItems] = useState<DriveItem[]>([]);
  const [warning, setWarning] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/drive", { cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (alive) {
          setItems(Array.isArray(json?.items) ? json.items : []);
          setWarning(json?.warning ?? null);
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <main className="min-h-screen hud-grid px-6 py-10">
      <div className="mx-auto max-w-6xl">
        <TopBar title="Dokumente" subtitle="ARCHIVE / DOCTRINE" right={<Link href="/" className="btn btn-ghost">← Command Deck</Link>} />

        {warning ? (
          <div className="mb-6 rounded-xl border border-marine-500/40 bg-marine-500/10 p-4 text-sm text-hud-text">
            {warning}
          </div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-3">
          <HudCard title="Einheitsdokumente (für alle)">
            {loading ? (
              <div className="text-hud-muted">Lade…</div>
            ) : items.length ? (
              <div className="space-y-2">
                {items.slice(0, 40).map((it) => (
                  <a
                    key={it.id}
                    className="block rounded-xl border border-hud-line/70 bg-black/20 px-4 py-3 text-sm hover:bg-white/5"
                    href={`https://drive.google.com/file/d/${it.id}/view`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {it.name}
                  </a>
                ))}
                {items.length > 40 ? <div className="text-xs text-hud-muted">… und mehr</div> : null}
              </div>
            ) : (
              <div className="text-hud-muted">Keine Dateien gefunden.</div>
            )}
          </HudCard>

          <HudCard title="Unteroffiziersdokument">
            <p className="text-sm text-hud-muted">Zugriff nur, wenn du dafür freigeschaltet bist.</p>
            <div className="mt-4 flex flex-col gap-2">
              <Link href="/documents/uo" className="btn btn-accent">UO Dokument öffnen</Link>
            </div>
          </HudCard>

          <HudCard title="Führungsebene (FE-ID)">
            <p className="text-sm text-hud-muted">Eigenes Modul – separat verbindbar.</p>
            <div className="mt-4 flex flex-col gap-2">
              <Link href="/documents/fe" className="btn btn-accent">FE Dokument öffnen</Link>
            </div>
          </HudCard>
        </div>
      </div>
    </main>
  );
}
