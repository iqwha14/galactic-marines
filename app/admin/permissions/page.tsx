"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { TopBar, HudCard } from "@/app/_components/Hud";

type Row = {
  discord_id: string;
  display_name: string | null;
  is_editor: boolean;
  is_admin: boolean;
  can_see_uo: boolean;
  can_see_fe: boolean;
  updated_at?: string;
};

function parseJsonSafe(text: string) {
  try { return JSON.parse(text); } catch { return null; }
}

export default function PermissionsConsole() {
  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState({
    discord_id: "",
    display_name: "",
    is_editor: false,
    is_admin: false,
    can_see_uo: false,
    can_see_fe: false,
  });

  const load = async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/permissions", { cache: "no-store" });
      const text = await res.text();
      const json = parseJsonSafe(text);
      if (!res.ok) throw new Error(json?.error || json?.details || text || `Request failed (${res.status})`);
      setRows(Array.isArray(json?.rows) ? json.rows : []);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    setToast(null);
    setErr(null);
    try {
      const res = await fetch("/api/admin/permissions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      const text = await res.text();
      const json = parseJsonSafe(text);
      if (!res.ok) throw new Error(json?.error || json?.details || text || `Request failed (${res.status})`);
      setToast("Gespeichert.");
      setForm({ discord_id: "", display_name: "", is_editor: false, is_admin: false, can_see_uo: false, can_see_fe: false });
      await load();
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    }
  };

  const rowsSorted = useMemo(() => {
    return [...rows].sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""));
  }, [rows]);

  return (
    <main className="min-h-screen hud-grid px-6 py-10">
      <div className="mx-auto max-w-6xl">
        <TopBar title="Permissions Console" subtitle="ADMIN / ROLES" right={<Link href="/admin" className="btn btn-ghost">← Verwaltung</Link>} />

        {toast ? <div className="mb-6 rounded-xl border border-hud-line/70 bg-black/20 p-3 text-sm">{toast}</div> : null}
        {err ? (
          <div className="mb-6 rounded-xl border border-marine-500/40 bg-marine-500/10 p-4 text-sm">
            <div className="font-medium">Fehler</div>
            <div className="mt-1 text-hud-muted">{err}</div>
          </div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-2">
          <HudCard title="User Rechte setzen">
            <div className="grid gap-3">
              <label className="text-sm">
                <div className="text-xs text-hud-muted mb-1">Discord ID (Pflicht)</div>
                <input
                  className="w-full rounded-xl border border-hud-line/80 bg-black/30 px-3 py-2 outline-none focus:border-marine-500/60"
                  value={form.discord_id}
                  onChange={(e) => setForm((f) => ({ ...f, discord_id: e.target.value }))}
                  placeholder="z.B. 123456789012345678"
                />
              </label>

              <label className="text-sm">
                <div className="text-xs text-hud-muted mb-1">Anzeigename (optional)</div>
                <input
                  className="w-full rounded-xl border border-hud-line/80 bg-black/30 px-3 py-2 outline-none focus:border-marine-500/60"
                  value={form.display_name}
                  onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))}
                  placeholder="z.B. CPT Rex"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                {[
                  ["is_admin", "Admin (alles)"],
                  ["is_editor", "Editor"],
                  ["can_see_uo", "UO Dokument"],
                  ["can_see_fe", "FE Dokument"],
                ].map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2 rounded-xl border border-hud-line/70 bg-black/20 px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      checked={(form as any)[key]}
                      onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.checked } as any))}
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>

              <button className="btn btn-accent" onClick={save} disabled={!form.discord_id.trim()}>
                Speichern
              </button>

              <div className="text-xs text-hud-muted">
                Hinweis: Für Offline-Rechte brauchst du in Supabase die Tabelle <code className="text-white/80">gm_user_permissions</code>.
              </div>
            </div>
          </HudCard>

          <HudCard title="Aktuelle Einträge">
            {loading ? (
              <div className="text-hud-muted">Lade…</div>
            ) : (
              <div className="space-y-2">
                {rowsSorted.map((r) => (
                  <div key={r.discord_id} className="rounded-xl border border-hud-line/70 bg-black/20 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium">{r.display_name || r.discord_id}</div>
                        <div className="mt-1 text-xs text-hud-muted">{r.discord_id}</div>
                      </div>
                      <div className="text-xs text-hud-muted">{r.updated_at ? new Date(r.updated_at).toLocaleString("de-DE") : ""}</div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      {r.is_admin ? <span className="chip">ADMIN</span> : null}
                      {r.is_editor ? <span className="chip">EDITOR</span> : null}
                      {r.can_see_uo ? <span className="chip">UO</span> : null}
                      {r.can_see_fe ? <span className="chip">FE</span> : null}
                    </div>
                  </div>
                ))}
                {!rowsSorted.length ? <div className="text-hud-muted">Keine Einträge.</div> : null}
              </div>
            )}
          </HudCard>
        </div>
      </div>
    </main>
  );
}
