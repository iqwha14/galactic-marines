"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { TopBar, HudCard } from "@/app/_components/Hud";

function parseJsonSafe(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export default function LogsPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/log", { cache: "no-store" });
      const text = await res.text();
      const json = parseJsonSafe(text);
      if (!res.ok) throw new Error(json?.error || json?.details || text || `Request failed (${res.status})`);
      setRows(Array.isArray(json?.logs) ? json.logs : Array.isArray(json) ? json : json?.data ?? []);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <main className="min-h-screen hud-grid px-6 py-10">
      <div className="mx-auto max-w-6xl">
        <TopBar title="Logs" subtitle="ADMIN / LOGS" right={<Link href="/admin" className="btn btn-ghost">← Verwaltung</Link>} />

        {err ? (
          <div className="mb-6 rounded-xl border border-marine-500/40 bg-marine-500/10 p-4 text-sm">
            <div className="font-medium">Fehler</div>
            <div className="mt-1 text-hud-muted">{err}</div>
          </div>
        ) : null}

        <HudCard title="Letzte Einträge" right={<button className="btn btn-ghost" onClick={load} disabled={loading}>Reload</button>}>
          {loading ? <div className="text-hud-muted">Lade…</div> : null}
          <div className="mt-3 space-y-2">
            {rows.map((r, idx) => (
              <div key={idx} className="rounded-xl border border-hud-line/70 bg-black/20 p-3">
                <div className="text-sm font-medium">{r.action ?? r.event ?? "log"}</div>
                <div className="mt-1 text-xs text-hud-muted">
                  {r.created_at ? new Date(r.created_at).toLocaleString("de-DE") : ""}
                  {r.actor ? ` • actor: ${r.actor}` : r.actor_discord_id ? ` • actor: ${r.actor_discord_id}` : ""}
                </div>
                {r.meta ? <pre className="mt-2 overflow-x-auto text-xs text-white/70">{JSON.stringify(r.meta, null, 2)}</pre> : null}
              </div>
            ))}
            {!rows.length && !loading ? <div className="text-hud-muted">Keine Logs.</div> : null}
          </div>
        </HudCard>
      </div>
    </main>
  );
}
