"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { TopBar, HudCard } from "@/app/_components/Hud";

function parseJsonSafe(text: string) {
  try { return JSON.parse(text); } catch { return null; }
}

export default function AuditPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [warning, setWarning] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setErr(null);
      const res = await fetch("/api/admin/audit", { cache: "no-store" });
      const text = await res.text();
      const json = parseJsonSafe(text);
      if (!res.ok) {
        if (alive) setErr(json?.error || json?.details || text || `Request failed (${res.status})`);
        return;
      }
      if (alive) {
        setRows(Array.isArray(json?.rows) ? json.rows : []);
        setWarning(json?.warning ?? null);
      }
    })();
    return () => { alive = false; };
  }, []);

  return (
    <main className="min-h-screen hud-grid px-6 py-10">
      <div className="mx-auto max-w-6xl">
        <TopBar title="Audit-Trail" subtitle="ADMIN / AUDIT" right={<Link href="/admin" className="btn btn-ghost">← Verwaltung</Link>} />
        {warning ? <div className="mb-6 rounded-xl border border-hud-line/70 bg-black/20 p-3 text-sm">{warning}</div> : null}
        {err ? <div className="mb-6 rounded-xl border border-marine-500/40 bg-marine-500/10 p-4 text-sm">{err}</div> : null}

        <HudCard title="Letzte Events">
          <div className="space-y-2">
            {rows.map((r, idx) => (
              <div key={idx} className="rounded-xl border border-hud-line/70 bg-black/20 p-3">
                <div className="text-sm font-medium">{r.action ?? "event"}</div>
                <div className="mt-1 text-xs text-hud-muted">{r.created_at ? new Date(r.created_at).toLocaleString("de-DE") : ""}</div>
                {r.actor_discord_id ? <div className="mt-1 text-xs text-hud-muted">actor: {r.actor_discord_id}</div> : null}
                {r.meta ? <pre className="mt-2 overflow-x-auto text-xs text-white/70">{JSON.stringify(r.meta, null, 2)}</pre> : null}
              </div>
            ))}
            {!rows.length ? <div className="text-hud-muted">Keine Daten.</div> : null}
          </div>
        </HudCard>
      </div>
    </main>
  );
}
