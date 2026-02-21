"use client";

import Link from "next/link";
import { useState } from "react";
import { TopBar, HudCard } from "@/app/_components/Hud";

function parseJsonSafe(text: string) {
  try { return JSON.parse(text); } catch { return null; }
}

export default function EmergencyPage() {
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const setMode = async (enabled: boolean) => {
    setBusy(true);
    setErr(null);
    setToast(null);
    try {
      const res = await fetch("/api/admin/emergency", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      const text = await res.text();
      const json = parseJsonSafe(text);
      if (!res.ok) throw new Error(json?.error || json?.details || text || `Request failed (${res.status})`);
      setToast(enabled ? "Notfallmodus: AKTIV" : "Notfallmodus: AUS");
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen hud-grid px-6 py-10">
      <div className="mx-auto max-w-6xl">
        <TopBar title="Notfallmodus" subtitle="ADMIN / EMERGENCY" right={<Link href="/admin" className="btn btn-ghost">← Verwaltung</Link>} />
        {toast ? <div className="mb-6 rounded-xl border border-hud-line/70 bg-black/20 p-3 text-sm">{toast}</div> : null}
        {err ? <div className="mb-6 rounded-xl border border-marine-500/40 bg-marine-500/10 p-4 text-sm">{err}</div> : null}

        <HudCard title="Emergency Switch">
          <p className="text-sm text-hud-muted">
            Setzt Flag <code className="text-white/80">emergency_lockdown</code> (gm_feature_flags). Nutze das z.B. um UI-Aktionen zu sperren.
          </p>
          <div className="mt-4 flex gap-3">
            <button className="btn btn-accent" disabled={busy} onClick={() => setMode(true)}>
              Aktivieren
            </button>
            <button className="btn btn-ghost" disabled={busy} onClick={() => setMode(false)}>
              Deaktivieren
            </button>
          </div>
        </HudCard>
      </div>
    </main>
  );
}
