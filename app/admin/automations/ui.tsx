"use client";

import { useEffect, useMemo, useState } from "react";

type Planned = {
  id: string;
  enabled: boolean;
  webhook_url: string;
  content: string;
  schedule: "once" | "daily" | "weekly";
  run_at: string | null;
  time_of_day: string | null;
  day_of_week: number | null;
  timezone: string;
  next_run_at: string | null;
  last_run_at: string | null;
};

type AktenSettings = {
  id: number;
  enabled: boolean;
  webhook_url: string;
  timezone: string;
  day_of_week: number;
  time_of_day: string;
  followup_delay_minutes: number;
  next_poll_at: string | null;
  active_poll_created_at: string | null;
};

type AktenPool = {
  name: string; // key: user:ID or role:ID
  mention_type: "user" | "role";
  mention_id: string | null;
  label: string | null;
  times_assigned: number;
  last_assigned_at: string | null;
};

type AktenHistory = {
  id: string;
  happened_at: string;
  chosen_primary_name: string | null;
  chosen_backup_name: string | null;
  mode: "auto";
  poll_created_at?: string | null;
};

function fmt(ts?: string | null) {
  if (!ts) return "—";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

const DOW = [
  { v: 1, label: "Montag" },
  { v: 2, label: "Dienstag" },
  { v: 3, label: "Mittwoch" },
  { v: 4, label: "Donnerstag" },
  { v: 5, label: "Freitag" },
  { v: 6, label: "Samstag" },
  { v: 7, label: "Sonntag" },
];

export default function AutomationsClient() {
  const [tab, setTab] = useState<"planned" | "akten">("planned");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);

  const [planned, setPlanned] = useState<Planned[]>([]);
  const [plannedWarning, setPlannedWarning] = useState<string | null>(null);

  const [aktenSettings, setAktenSettings] = useState<AktenSettings | null>(null);
  const [aktenPool, setAktenPool] = useState<AktenPool[]>([]);
  const [aktenHistory, setAktenHistory] = useState<AktenHistory[]>([]);
  const [aktenWarning, setAktenWarning] = useState<string | null>(null);

  const [newPlanned, setNewPlanned] = useState<Partial<Planned>>({
    enabled: true,
    schedule: "once",
    timezone: "Europe/Berlin",
    webhook_url: "",
    content: "",
    run_at: new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16),
    time_of_day: "19:00",
    day_of_week: 5,
  });

  const [poolAdd, setPoolAdd] = useState<string>("");

  const activePollInfo = useMemo(() => {
    if (!aktenSettings?.active_poll_created_at) return null;
    return { created: fmt(aktenSettings.active_poll_created_at) };
  }, [aktenSettings]);

  async function loadAll() {
    setBusy(true);
    try {
      const [a, b] = await Promise.all([
        fetch("/api/admin/automations/planned", { cache: "no-store" }).then((r) => r.json()),
        fetch("/api/admin/automations/akten", { cache: "no-store" }).then((r) => r.json()),
      ]);

      if (a?.ok) {
        setPlanned(a.items ?? []);
        setPlannedWarning(a.warning ?? null);
      } else {
        setPlannedWarning(a?.error ?? "Fehler beim Laden.");
      }

      if (b?.ok) {
        setAktenSettings(b.settings ?? null);
        setAktenPool(b.pool ?? []);
        setAktenHistory(b.history ?? []);
        setAktenWarning(b.warning ?? null);
      } else {
        setAktenWarning(b?.error ?? "Fehler beim Laden.");
      }
    } catch (e: any) {
      setToast({ kind: "err", msg: e?.message ?? String(e) });
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  async function savePlanned() {
    setBusy(true);
    try {
      const payload: any = {
        enabled: !!newPlanned.enabled,
        webhook_url: String(newPlanned.webhook_url ?? "").trim(),
        content: String(newPlanned.content ?? "").trim(),
        schedule: newPlanned.schedule ?? "once",
        timezone: newPlanned.timezone ?? "Europe/Berlin",
      };

      if (payload.schedule === "once") {
        const dt = String(newPlanned.run_at ?? "").trim();
        payload.run_at = dt ? new Date(dt).toISOString() : null;
      } else {
        payload.time_of_day = String(newPlanned.time_of_day ?? "").trim();
        if (payload.schedule === "weekly") payload.day_of_week = Number(newPlanned.day_of_week ?? 1);
      }

      const res = await fetch("/api/admin/automations/planned", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).then((r) => r.json());

      if (!res?.ok) throw new Error(res?.error ?? "Save failed");
      setToast({ kind: "ok", msg: "Planned Message gespeichert." });
      setNewPlanned({
        enabled: true,
        schedule: "once",
        timezone: "Europe/Berlin",
        webhook_url: payload.webhook_url,
        content: "",
        run_at: new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16),
        time_of_day: "19:00",
        day_of_week: 5,
      });
      await loadAll();
    } finally {
      setBusy(false);
    }
  }

  async function deletePlanned(id: string) {
    if (!id) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/automations/planned?id=${encodeURIComponent(id)}`, { method: "DELETE" }).then((r) => r.json());
      if (!res?.ok) throw new Error(res?.error ?? "Delete failed");
      setToast({ kind: "ok", msg: "Gelöscht." });
      await loadAll();
    } finally {
      setBusy(false);
    }
  }

  async function saveAktenSettings(next: Partial<AktenSettings>) {
    setBusy(true);
    try {
      const s = { ...aktenSettings, ...next } as any;
      const res = await fetch("/api/admin/automations/akten", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          op: "save_settings",
          enabled: !!s.enabled,
          webhook_url: String(s.webhook_url ?? "").trim(),
          timezone: String(s.timezone ?? "Europe/Berlin").trim(),
          day_of_week: Number(s.day_of_week ?? 1),
          time_of_day: String(s.time_of_day ?? "18:00").trim(),
          followup_delay_minutes: Number(s.followup_delay_minutes ?? 180),
        }),
      }).then((r) => r.json());
      if (!res?.ok) throw new Error(res?.error ?? "Save failed");
      setToast({ kind: "ok", msg: "Aktenkontrolle gespeichert." });
      await loadAll();
    } finally {
      setBusy(false);
    }
  }

  async function addPool() {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/automations/akten", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "add_pool", input: poolAdd }),
      }).then((r) => r.json());
      if (!res?.ok) throw new Error(res?.error ?? "Add failed");
      setPoolAdd("");
      setToast({ kind: "ok", msg: "Pool-Eintrag hinzugefügt." });
      await loadAll();
    } finally {
      setBusy(false);
    }
  }

  async function removePool(name: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/automations/akten", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "remove_pool", name }),
      }).then((r) => r.json());
      if (!res?.ok) throw new Error(res?.error ?? "Remove failed");
      setToast({ kind: "ok", msg: "Entfernt." });
      await loadAll();
    } finally {
      setBusy(false);
    }
  }

  async function resetFairness() {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/automations/akten", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "reset_fairness" }),
      }).then((r) => r.json());
      if (!res?.ok) throw new Error(res?.error ?? "Reset failed");
      setToast({ kind: "ok", msg: "Fairness-Stats zurückgesetzt." });
      await loadAll();
    } finally {
      setBusy(false);
    }
  }

  async function testCron() {
    setBusy(true);
    try {
      const secret = (document.getElementById("cronSecret") as HTMLInputElement | null)?.value?.trim();
      if (!secret) throw new Error("CRON Secret fehlt.");
      const res = await fetch(`/api/cron/automations?secret=${encodeURIComponent(secret)}`, { cache: "no-store" }).then((r) => r.json());
      if (!res?.ok) throw new Error(res?.error ?? "Cron failed");
      setToast({ kind: "ok", msg: `Cron ausgeführt: planned sent ${res.planned?.sent ?? 0}, akten polls ${res.akten?.pollsSent ?? 0}` });
      await loadAll();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {toast ? (
        <div className={"fixed top-4 left-1/2 -translate-x-1/2 z-[9999] rounded-xl border px-4 py-2 shadow-hud " + (toast.kind === "ok" ? "border-emerald-500/40 bg-emerald-500/10" : "border-red-500/40 bg-red-500/10")}>
          <div className="text-sm">{toast.msg}</div>
        </div>
      ) : null}

      <section className="rounded-2xl border border-hud-line/80 bg-hud-panel/80 p-5 shadow-hud">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm tracking-[0.22em] uppercase text-hud-muted">Runner</h2>
            <p className="mt-2 text-sm text-hud-muted">
              Diese Automationen laufen über einen Cron-Call auf <code className="text-white/80">/api/cron/automations</code>.
              Setz <code className="text-white/80">CRON_SECRET</code> in deiner Env und ping die URL z.B. alle 1–5 Minuten.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input id="cronSecret" placeholder="CRON_SECRET" className="hud-input" />
            <button className="btn btn-ghost" onClick={testCron} disabled={busy} type="button">
              Test-Run
            </button>
          </div>
        </div>
      </section>

      <div className="flex items-center gap-2">
        <button className={"btn " + (tab === "planned" ? "btn-accent" : "btn-ghost")} onClick={() => setTab("planned")} type="button">Planned Messages</button>
        <button className={"btn " + (tab === "akten" ? "btn-accent" : "btn-ghost")} onClick={() => setTab("akten")} type="button">Aktenkontrolle</button>
        <button className="btn btn-ghost ml-auto" onClick={loadAll} disabled={busy} type="button">Reload</button>
      </div>

      {tab === "planned" ? (
        <section className="rounded-2xl border border-hud-line/80 bg-hud-panel/80 p-5 shadow-hud">
          <h2 className="text-sm tracking-[0.22em] uppercase text-hud-muted">Planned Messages</h2>
          {plannedWarning ? <div className="mt-3 text-sm text-amber-200">{plannedWarning}</div> : null}

          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <div className="rounded-xl border border-hud-line/70 bg-black/20 p-4">
              <div className="font-medium">Neu anlegen</div>
              <div className="mt-3 grid gap-2">
                <label className="text-xs text-hud-muted">Webhook URL</label>
                <input className="hud-input" value={newPlanned.webhook_url ?? ""} onChange={(e) => setNewPlanned((s) => ({ ...s, webhook_url: e.target.value }))} />

                <label className="text-xs text-hud-muted mt-2">Schedule</label>
                <select className="hud-input" value={newPlanned.schedule ?? "once"} onChange={(e) => setNewPlanned((s) => ({ ...s, schedule: e.target.value as any }))}>
                  <option value="once">Einmalig</option>
                  <option value="daily">Täglich</option>
                  <option value="weekly">Wöchentlich</option>
                </select>

                {newPlanned.schedule === "once" ? (
                  <>
                    <label className="text-xs text-hud-muted mt-2">Zeitpunkt</label>
                    <input type="datetime-local" className="hud-input" value={String(newPlanned.run_at ?? "")} onChange={(e) => setNewPlanned((s) => ({ ...s, run_at: e.target.value }))} />
                  </>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <div>
                        <label className="text-xs text-hud-muted">Uhrzeit</label>
                        <input className="hud-input" value={String(newPlanned.time_of_day ?? "") } onChange={(e) => setNewPlanned((s) => ({ ...s, time_of_day: e.target.value }))} placeholder="HH:MM" />
                      </div>
                      {newPlanned.schedule === "weekly" ? (
                        <div>
                          <label className="text-xs text-hud-muted">Wochentag</label>
                          <select className="hud-input" value={Number(newPlanned.day_of_week ?? 1)} onChange={(e) => setNewPlanned((s) => ({ ...s, day_of_week: Number(e.target.value) }))}>
                            {DOW.map((d) => (
                              <option key={d.v} value={d.v}>{d.label}</option>
                            ))}
                          </select>
                        </div>
                      ) : (
                        <div />
                      )}
                    </div>
                  </>
                )}

                <label className="text-xs text-hud-muted mt-2">Message</label>
                <textarea className="hud-input min-h-[120px]" value={newPlanned.content ?? ""} onChange={(e) => setNewPlanned((s) => ({ ...s, content: e.target.value }))} />

                <div className="mt-2 flex items-center gap-2">
                  <label className="text-sm flex items-center gap-2">
                    <input type="checkbox" checked={!!newPlanned.enabled} onChange={(e) => setNewPlanned((s) => ({ ...s, enabled: e.target.checked }))} />
                    Enabled
                  </label>
                  <button className="btn btn-accent ml-auto" onClick={savePlanned} disabled={busy} type="button">Speichern</button>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-hud-line/70 bg-black/20 p-4">
              <div className="font-medium">Bestehende</div>
              <div className="mt-3 space-y-3">
                {planned.length === 0 ? <div className="text-sm text-hud-muted">Keine Einträge.</div> : null}
                {planned.map((p) => (
                  <div key={p.id} className="rounded-xl border border-hud-line/60 bg-black/10 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium">{p.schedule.toUpperCase()} {p.enabled ? "🟢" : "⚫"}</div>
                        <div className="mt-1 text-xs text-hud-muted">Next: {fmt(p.next_run_at)} · Last: {fmt(p.last_run_at)}</div>
                      </div>
                      <button className="btn btn-ghost" onClick={() => deletePlanned(p.id)} disabled={busy} type="button">Delete</button>
                    </div>
                    <div className="mt-2 text-sm whitespace-pre-wrap">{p.content}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {tab === "akten" ? (
        <section className="rounded-2xl border border-hud-line/80 bg-hud-panel/80 p-5 shadow-hud">
          <h2 className="text-sm tracking-[0.22em] uppercase text-hud-muted">Aktenkontrolle</h2>
          {aktenWarning ? <div className="mt-3 text-sm text-amber-200">{aktenWarning}</div> : null}

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-hud-line/70 bg-black/20 p-4">
              <div className="font-medium">Einstellungen</div>
              {!aktenSettings ? (
                <div className="mt-3 text-sm text-hud-muted">Noch keine Settings (SQL ausführen).</div>
              ) : (
                <div className="mt-3 grid gap-2">
                  <label className="text-sm flex items-center gap-2">
                    <input type="checkbox" checked={aktenSettings.enabled} onChange={(e) => saveAktenSettings({ enabled: e.target.checked })} disabled={busy} />
                    Enabled
                  </label>
                  <label className="text-xs text-hud-muted">Webhook URL</label>
                  <input className="hud-input" value={aktenSettings.webhook_url ?? ""} onChange={(e) => setAktenSettings((s) => (s ? { ...s, webhook_url: e.target.value } : s))} />
                  <label className="text-xs text-hud-muted mt-2">Wochentag</label>
                  <select className="hud-input" value={aktenSettings.day_of_week} onChange={(e) => setAktenSettings((s) => (s ? { ...s, day_of_week: Number(e.target.value) } : s))}>
                    {DOW.map((d) => (
                      <option key={d.v} value={d.v}>{d.label}</option>
                    ))}
                  </select>
                  <label className="text-xs text-hud-muted mt-2">Uhrzeit (HH:MM)</label>
                  <input className="hud-input" value={aktenSettings.time_of_day ?? ""} onChange={(e) => setAktenSettings((s) => (s ? { ...s, time_of_day: e.target.value } : s))} />
                  <label className="text-xs text-hud-muted mt-2">Followup Delay (Minuten)</label>
                  <input className="hud-input" type="number" value={aktenSettings.followup_delay_minutes ?? 180} onChange={(e) => setAktenSettings((s) => (s ? { ...s, followup_delay_minutes: Number(e.target.value) } : s))} />
                  <div className="mt-2 flex items-center justify-between">
                    <div className="text-xs text-hud-muted">Next Poll: {fmt(aktenSettings.next_poll_at)}</div>
                    <button className="btn btn-accent" onClick={() => saveAktenSettings({})} disabled={busy} type="button">Speichern</button>
                  </div>
                  {activePollInfo ? (
                    <div className="mt-2 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-sm">
                      <div className="font-medium">Aktive Poll</div>
                      <div className="mt-1 text-hud-muted">Created: {activePollInfo.created}</div>
                    </div>
                  ) : null}
                  <div className="mt-2 text-xs text-hud-muted">Webhook-only Modus: Reactions/Volunteers werden nicht automatisch ausgewertet.</div>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-hud-line/70 bg-black/20 p-4">
              <div className="font-medium">Namenspool (fair)</div>
              <div className="mt-3 grid gap-2">
                <input className="hud-input" placeholder="user:123456789012345678|XY  oder  role:987654321098765432|Offiziere  oder  <@123>|XY" value={poolAdd} onChange={(e) => setPoolAdd(e.target.value)} />
                <div className="text-xs text-hud-muted">Hinweis: Discord IDs bekommst du mit Developer Mode → Rechtsklick User/Rolle → ID kopieren. Mentions werden per Webhook gesendet (ohne Bot).</div>
                <div className="flex items-center gap-2">
                  <button className="btn btn-accent" onClick={addPool} disabled={busy || !poolAdd.trim()} type="button">Hinzufügen</button>
                  <button className="btn btn-ghost" onClick={resetFairness} disabled={busy} type="button">Fairness Reset</button>
                </div>

                <div className="mt-2 space-y-2">
                  {aktenPool.length === 0 ? <div className="text-sm text-hud-muted">Pool ist leer.</div> : null}
                  {aktenPool
                    .slice()
                    .sort((a, b) => (a.times_assigned ?? 0) - (b.times_assigned ?? 0))
                    .map((u) => (
                      <div key={u.name} className="rounded-xl border border-hud-line/60 bg-black/10 p-3 flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-medium">{u.label ?? u.name}</div>
                          <div className="text-xs text-hud-muted">
                            {u.mention_id ? (
                              <span>
                                mention: <code className="text-white/80">{u.mention_type === "role" ? `<@&${u.mention_id}>` : `<@${u.mention_id}>`}</code>
                                {" · "}
                              </span>
                            ) : null}
                            times: {u.times_assigned ?? 0} · last: {fmt(u.last_assigned_at)}
                          </div>
                        </div>
                        <button className="btn btn-ghost" onClick={() => removePool(u.name)} disabled={busy} type="button">Remove</button>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-xl border border-hud-line/70 bg-black/20 p-4">
            <div className="font-medium">Letzte Zuteilungen</div>
            <div className="mt-3 space-y-2">
              {aktenHistory.length === 0 ? <div className="text-sm text-hud-muted">Keine History.</div> : null}
              {aktenHistory.map((h) => (
                <div key={h.id} className="rounded-xl border border-hud-line/60 bg-black/10 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-medium">Auto</div>
                    <div className="text-xs text-hud-muted">{fmt(h.happened_at)}</div>
                  </div>
                  <div className="mt-1 text-sm text-hud-muted">
                    Primary: {h.chosen_primary_name ?? "—"}{h.chosen_backup_name ? ` · Backup: ${h.chosen_backup_name}` : ""}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
