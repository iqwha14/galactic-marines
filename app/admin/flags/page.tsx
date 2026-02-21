"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { TopBar, HudCard } from "@/app/_components/Hud";

type Flag = { key: string; enabled: boolean; updated_at?: string };

function parseJsonSafe(text: string) {
  try { return JSON.parse(text); } catch { return null; }
}

export default function FlagsPage() {
  const [flags, setFlags] = useState<Flag[]>([]);
  const [warning, setWarning] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = async () => {
    setErr(null);
    const res = await fetch("/api/admin/flags", { cache: "no-store" });
    const text = await res.text();
    const json = parseJsonSafe(text);
    if (!res.ok) throw new Error(json?.error || json?.details || text || `Request failed (${res.status})`);
    setFlags(Array.isArray(json?.flags) ? json.flags : []);
    setWarning(json?.warning ?? null);
  };

  useEffect(() => { load().catch((e) => setErr(e.message)); }, []);

  const toggle = async (key: string, enabled: boolean) => {
    setToast(null);
    setErr(null);
    try {
      const res = await fetch("/api/admin/flags", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key, enabled }),
      });
      const text = await res.text();
      const json = parseJsonSafe(text);
      if (!res.ok) throw new Error(json?.error || json?.details || text || `Request failed (${res.status})`);
      setToast("Gespeichert.");
      await load();
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    }
  };

  return (
    <main className="min-h-screen hud-grid px-6 py-10">
      <div className="mx-auto max-w-6xl">
        <TopBar title="Feature Toggles" subtitle="ADMIN / FLAGS" right={<Link href="/admin" className="btn btn-ghost">← Verwaltung</Link>} />
        {warning ? <div className="mb-6 rounded-xl border border-hud-line/70 bg-black/20 p-3 text-sm">{warning}</div> : null}
        {toast ? <div className="mb-6 rounded-xl border border-hud-line/70 bg-black/20 p-3 text-sm">{toast}</div> : null}
        {err ? <div className="mb-6 rounded-xl border border-marine-500/40 bg-marine-500/10 p-4 text-sm">{err}</div> : null}

        <HudCard title="Flags">
          <div className="space-y-2">
            {flags.map((f) => (
              <div key={f.key} className="flex items-center justify-between rounded-xl border border-hud-line/70 bg-black/20 p-3">
                <div>
                  <div className="font-medium">{f.key}</div>
                  <div className="mt-1 text-xs text-hud-muted">{f.updated_at ? new Date(f.updated_at).toLocaleString("de-DE") : ""}</div>
                </div>
                <button className="btn btn-accent" onClick={() => toggle(f.key, !f.enabled)}>
                  {f.enabled ? "Disable" : "Enable"}
                </button>
              </div>
            ))}
            {!flags.length ? <div className="text-hud-muted">Keine Flags.</div> : null}
          </div>

          <div className="mt-4 text-xs text-hud-muted">
            Optional: Tabelle <code className="text-white/80">gm_feature_flags</code>.
          </div>
        </HudCard>
      </div>
    </main>
  );
}
