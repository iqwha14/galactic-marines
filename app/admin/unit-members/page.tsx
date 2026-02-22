"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";

type Marine = { id: string; name: string; rank: string; unitGroup: string; url: string };
type Row = {
  discord_id: string;
  marine_card_id: string;
  display_name: string | null;
  updated_at?: string;
};

function parseJsonSafe(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export default function UnitMembersAdminPage() {
  const { data: session } = useSession();
  const isAdmin = !!(session as any)?.isAdmin;

  const [rows, setRows] = useState<Row[]>([]);
  const [roster, setRoster] = useState<Marine[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);

  const [discordId, setDiscordId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [marineCardId, setMarineCardId] = useState("");

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4200);
    return () => clearTimeout(t);
  }, [toast]);

  async function loadAll() {
    setErr(null);
    const [a, b] = await Promise.all([
      fetch("/api/admin/unit-members", { cache: "no-store" }),
      fetch("/api/trello", { cache: "no-store" }),
    ]);

    const at = await a.text();
    const aj = parseJsonSafe(at);
    if (!a.ok) throw new Error(aj?.error || aj?.details || at || "Load failed");

    const bj = await b.json();
    if (!b.ok) throw new Error(bj?.error || "Roster load failed");

    setRows((aj?.rows ?? []) as Row[]);
    setRoster((bj?.marines ?? []) as Marine[]);
  }

  useEffect(() => {
    loadAll().catch((e: any) => setErr(String(e?.message ?? e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rosterById = useMemo(() => new Map(roster.map((m) => [m.id, m])), [roster]);
  const rosterSorted = useMemo(() => {
    const copy = [...roster];
    copy.sort((a, b) => a.rank.localeCompare(b.rank) || a.name.localeCompare(b.name, "de"));
    return copy;
  }, [roster]);

  async function upsert() {
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch("/api/admin/unit-members", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          discord_id: discordId.trim(),
          marine_card_id: marineCardId.trim(),
          display_name: displayName.trim() || null,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || j?.details || "Save failed");

      setDiscordId("");
      setDisplayName("");
      setMarineCardId("");
      await loadAll();
      setToast({ kind: "ok", msg: "Mitglied gespeichert." });
    } catch (e: any) {
      setErr(String(e?.message ?? e));
      setToast({ kind: "err", msg: String(e?.message ?? e) });
    } finally {
      setBusy(false);
    }
  }

  async function remove(discord_id: string) {
    if (!confirm(`Eintrag löschen?\n\n${discord_id}`)) return;
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch("/api/admin/unit-members", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ discord_id }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || j?.details || "Delete failed");
      await loadAll();
      setToast({ kind: "ok", msg: "Eintrag gelöscht." });
    } catch (e: any) {
      setErr(String(e?.message ?? e));
      setToast({ kind: "err", msg: String(e?.message ?? e) });
    } finally {
      setBusy(false);
    }
  }

  if (!isAdmin) {
    return (
      <main className="min-h-screen hud-grid px-6 py-10">
        <div className="mx-auto max-w-4xl">
          <div className="mb-6">
            <Link href="/admin" className="btn btn-ghost">
              ← Admin
            </Link>
          </div>
          <div className="rounded-2xl border border-marine-500/40 bg-marine-500/10 p-6">
            <div className="text-xs tracking-[0.22em] uppercase text-hud-muted">ACCESS CONTROL</div>
            <h1 className="mt-2 text-2xl font-semibold">Admin erforderlich</h1>
            <p className="mt-2 text-hud-muted">Nur Einheitsleitung kann die Mitgliederzuordnung pflegen.</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen hud-grid px-6 py-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex items-center justify-between gap-3">
          <div>
            <div className="text-xs tracking-[0.22em] uppercase text-hud-muted">ADMIN / UNIT</div>
            <h1 className="mt-2 text-3xl font-semibold">Einheit Mitglieder (Discord ⇄ Trello)</h1>
            <p className="mt-2 text-hud-muted">
              Hier trägst du ein, wer zur Einheit gehört. Diese Zuordnung wird für „Einsatz beitreten“ und
              Teilnahme-gated Bewertungen verwendet.
            </p>
          </div>
          <Link href="/admin" className="btn btn-ghost">
            ← Admin
          </Link>
        </div>

        {toast ? (
          <div
            className={[
              "fixed top-6 left-1/2 -translate-x-1/2 z-50 rounded-xl border px-4 py-3 shadow-hud",
              toast.kind === "ok" ? "border-emerald-400/40 bg-emerald-500/15" : "border-red-400/40 bg-red-500/15",
            ].join(" ")}
          >
            {toast.msg}
          </div>
        ) : null}

        {err ? <div className="rounded-xl border border-red-400/40 bg-red-500/10 p-3 text-sm">{err}</div> : null}

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-2xl border border-hud-line/70 bg-black/10 p-5">
            <div className="text-xs tracking-[0.22em] uppercase text-hud-muted">Mitglied hinzufügen</div>
            <div className="mt-4 grid gap-3">
              <input
                className="hud-input"
                placeholder="Discord ID (z.B. 391637257892659204)"
                value={discordId}
                onChange={(e) => setDiscordId(e.target.value)}
              />
              <input
                className="hud-input"
                placeholder="Anzeige (optional)"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
              <select className="hud-input" value={marineCardId} onChange={(e) => setMarineCardId(e.target.value)}>
                <option value="">— Marine (Trello Karte) wählen —</option>
                {rosterSorted.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.rank} • {m.name} ({m.unitGroup})
                  </option>
                ))}
              </select>

              <button className="btn btn-accent" type="button" onClick={upsert} disabled={busy || !discordId || !marineCardId}>
                Speichern
              </button>

              <div className="text-xs text-hud-muted">
                Tipp: Discord IDs bekommst du über Discord → Einstellungen → Erweitert → Developer Mode → Rechtsklick User → ID
                kopieren.
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-hud-line/70 bg-black/10 p-5">
            <div className="text-xs tracking-[0.22em] uppercase text-hud-muted">Aktuelle Zuordnungen</div>
            <div className="mt-4 space-y-2 max-h-[520px] overflow-auto pr-1">
              {rows.map((r) => {
                const m = rosterById.get(r.marine_card_id);
                return (
                  <div key={r.discord_id} className="rounded-xl border border-hud-line/60 bg-black/10 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium">{r.display_name || r.discord_id}</div>
                        <div className="mt-1 text-xs text-hud-muted">Discord: {r.discord_id}</div>
                        <div className="mt-1 text-xs text-hud-muted">
                          Marine: {m ? `${m.rank} • ${m.name}` : r.marine_card_id}
                        </div>
                      </div>
                      <button className="btn btn-ghost" type="button" onClick={() => remove(r.discord_id)} disabled={busy}>
                        Löschen
                      </button>
                    </div>
                  </div>
                );
              })}
              {rows.length === 0 ? <div className="text-hud-muted">Keine Einträge.</div> : null}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
