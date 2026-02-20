"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";

type Marine = { id: string; name: string; rank: string; unitGroup: string; url: string };
type Operation = {
  id: string;
  title: string;
  planet: string;
  start_at: string;
  end_at: string | null;
  units: string[];
  outcome: string;
  summary: string;
  image_url: string | null;
  created_by_discord_id: string;
  created_at: string;
};
type Participant = { operation_id: string; marine_card_id: string; role: string | null; is_lead: boolean };
type Report = { id: string; operation_id: string; author_discord_id: string; title: string; content_md: string; created_at: string; updated_at: string };

function Stars({ value, onChange }: { value: number; onChange?: (v: number) => void }) {
  return (
    <div className="inline-flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          className={["text-lg leading-none", n <= value ? "text-amber-300" : "text-hud-line/80", onChange ? "hover:opacity-80" : ""].join(" ")}
          onClick={onChange ? () => onChange(n) : undefined}
          disabled={!onChange}
          title={`${n}/5`}
        >
          ★
        </button>
      ))}
    </div>
  );
}

function fmtDT(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("de-DE");
}

export default function OpsPanel() {
  const { data: session } = useSession();
  const discordId = (session as any)?.discordId as string | undefined;
  const canEdit = !!(session as any)?.isEditor;

  const [roster, setRoster] = useState<Marine[]>([]);
  const [ops, setOps] = useState<Operation[]>([]);
  const [selected, setSelected] = useState<Operation | null>(null);
  const [detail, setDetail] = useState<{ participants: Participant[]; reports: Report[]; ratings: any[]; marineRatings: any[] } | null>(null);

  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [newTitle, setNewTitle] = useState("");
  const [newPlanet, setNewPlanet] = useState("");
  const [newStart, setNewStart] = useState("");
  const [newOutcome, setNewOutcome] = useState("Unklar");
  const [newUnits, setNewUnits] = useState<string[]>([]);
  const [newSummary, setNewSummary] = useState("");
  const [newLead, setNewLead] = useState("");
  const [newMembers, setNewMembers] = useState<string[]>([]);

  const [opStars, setOpStars] = useState(0);
  const [opComment, setOpComment] = useState("");
  const [repTitle, setRepTitle] = useState("");
  const [repBody, setRepBody] = useState("");

  async function loadRoster() {
    const res = await fetch("/api/trello", { cache: "no-store" });
    const j = await res.json();
    if (!res.ok) throw new Error(j?.error || "Roster load failed");
    setRoster((j?.marines ?? []) as Marine[]);
  }

  async function loadOps() {
    const res = await fetch("/api/ops", { cache: "no-store" });
    const j = await res.json();
    if (!res.ok) throw new Error(j?.error || "Ops load failed");
    setOps(j.operations ?? []);
  }

  async function loadDetail(id: string) {
    const res = await fetch(`/api/ops/${id}`, { cache: "no-store" });
    const j = await res.json();
    if (!res.ok) throw new Error(j?.error || "Detail load failed");
    setDetail({ participants: j.participants ?? [], reports: j.reports ?? [], ratings: j.ratings ?? [], marineRatings: j.marineRatings ?? [] });
  }

  useEffect(() => {
    setErr(null);
    Promise.all([loadRoster(), loadOps()]).catch((e: any) => setErr(String(e?.message ?? e)));
  }, []);

  useEffect(() => {
    if (!selected) return;
    loadDetail(selected.id).catch((e: any) => setErr(String(e?.message ?? e)));
  }, [selected?.id]);

  const rosterById = useMemo(() => new Map(roster.map((m) => [m.id, m])), [roster]);

  const avgOp = useMemo(() => {
    const r = detail?.ratings ?? [];
    if (!r.length) return 0;
    return Math.round((r.reduce((a: any, b: any) => a + (Number(b.stars) || 0), 0) / r.length) * 10) / 10;
  }, [detail?.ratings]);

  async function createOp() {
    setErr(null);
    setBusy(true);
    try {
      const participants = [
        ...newMembers.map((id) => ({ marine_card_id: id, role: null, is_lead: false })),
        ...(newLead ? [{ marine_card_id: newLead, role: "Einsatzleitung", is_lead: true }] : []),
      ].reduce((acc: any[], p: any) => {
        if (!p.marine_card_id) return acc;
        if (acc.some((x) => x.marine_card_id === p.marine_card_id)) return acc;
        acc.push(p);
        return acc;
      }, []);

      const res = await fetch("/api/ops", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: newTitle,
          planet: newPlanet,
          start_at: newStart,
          units: newUnits,
          outcome: newOutcome,
          summary: newSummary,
          participants,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || j?.details || "Create failed");

      setNewTitle("");
      setNewPlanet("");
      setNewStart("");
      setNewUnits([]);
      setNewOutcome("Unklar");
      setNewSummary("");
      setNewLead("");
      setNewMembers([]);
      await loadOps();
      setSelected(j.operation);
    } finally {
      setBusy(false);
    }
  }

  async function uploadImage(file: File) {
    if (!selected) return;
    setErr(null);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/ops/${selected.id}/upload`, { method: "POST", body: fd });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || j?.details || "Upload failed");
      await loadOps();
      await loadDetail(selected.id);
    } finally {
      setBusy(false);
    }
  }

  async function rateOperation() {
    if (!selected) return;
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/ops/${selected.id}/rate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stars: opStars, comment: opComment }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || j?.details || "Rating failed");
      setOpComment("");
      await loadDetail(selected.id);
    } finally {
      setBusy(false);
    }
  }

  async function rateMarine(marine_card_id: string, stars: number) {
    if (!selected) return;
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/ops/${selected.id}/rate-marine`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ marine_card_id, stars }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || j?.details || "Marine rating failed");
      await loadDetail(selected.id);
    } finally {
      setBusy(false);
    }
  }

  async function addReport() {
    if (!selected) return;
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/ops/${selected.id}/reports`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: repTitle, content_md: repBody }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || j?.details || "Report failed");
      setRepTitle("");
      setRepBody("");
      await loadDetail(selected.id);
    } finally {
      setBusy(false);
    }
  }

  if (!discordId) {
    return <div className="rounded-2xl border border-hud-line/70 bg-black/20 p-4 text-hud-muted">Bitte zuerst mit Discord einloggen, um Einsätze zu sehen.</div>;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      <div className="rounded-2xl border border-hud-line/70 bg-black/20 p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs tracking-[0.22em] uppercase text-hud-muted">Einsätze</div>
          <button className="btn btn-ghost" onClick={() => loadOps().catch((e: any) => setErr(String(e?.message ?? e)))} disabled={busy}>
            Refresh
          </button>
        </div>

        <div className="mt-3 space-y-2">
          {ops.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => setSelected(o)}
              className={[
                "w-full text-left rounded-xl border px-3 py-3",
                selected?.id === o.id ? "border-marine-500/60 bg-marine-500/10" : "border-hud-line/60 bg-hud-panel/30 hover:bg-white/5",
              ].join(" ")}
            >
              <div className="font-medium">{o.title}</div>
              <div className="mt-1 text-xs text-hud-muted">
                {o.planet} • {fmtDT(o.start_at)}
              </div>
              <div className="mt-1 text-xs text-hud-muted">{(o.units ?? []).join(" • ") || "—"} • {o.outcome}</div>
            </button>
          ))}
          {ops.length === 0 ? <div className="text-hud-muted">Keine Einsätze.</div> : null}
        </div>

        <div className="mt-6">
          <div className="text-xs tracking-[0.22em] uppercase text-hud-muted">Neuer Einsatz</div>
          {!canEdit ? (
            <div className="mt-2 text-sm text-hud-muted">Nur Editor kann Einsätze anlegen.</div>
          ) : (
            <div className="mt-3 grid gap-2">
              <input className="hud-input" placeholder="Titel" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
              <input className="hud-input" placeholder="Planet / Map" value={newPlanet} onChange={(e) => setNewPlanet(e.target.value)} />
              <input className="hud-input" type="datetime-local" value={newStart} onChange={(e) => setNewStart(e.target.value)} />
              <select className="hud-input" value={newOutcome} onChange={(e) => setNewOutcome(e.target.value)}>
                {["Unklar", "Sieg", "Teilerfolg", "Rückzug", "Niederlage"].map((x) => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
              </select>

              <label className="text-xs text-hud-muted">Einheiten</label>
              <div className="flex flex-wrap gap-2">
                {["Haupteinheit", "Galactic Marine Elite", "44th"].map((u) => (
                  <button
                    key={u}
                    type="button"
                    className={[
                      "badge px-3 py-1 rounded-full border text-xs",
                      newUnits.includes(u) ? "border-marine-500/60 bg-marine-500/10" : "border-hud-line/70 bg-black/20",
                    ].join(" ")}
                    onClick={() => setNewUnits((prev) => (prev.includes(u) ? prev.filter((x) => x !== u) : [...prev, u]))}
                  >
                    {u}
                  </button>
                ))}
              </div>

              <textarea className="hud-input min-h-[90px]" placeholder="Verlauf (kurz)" value={newSummary} onChange={(e) => setNewSummary(e.target.value)} />

              <label className="text-xs text-hud-muted">Einsatzleitung</label>
              <select className="hud-input" value={newLead} onChange={(e) => setNewLead(e.target.value)}>
                <option value="">—</option>
                {roster.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.rank} • {m.name}
                  </option>
                ))}
              </select>

              <label className="text-xs text-hud-muted">Teilnehmer</label>
              <select
                className="hud-input"
                multiple
                value={newMembers}
                onChange={(e) => setNewMembers(Array.from(e.target.selectedOptions).map((o) => o.value))}
                size={6}
              >
                {roster.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.rank} • {m.name}
                  </option>
                ))}
              </select>

              <button className="btn btn-accent" onClick={createOp} disabled={busy || !newTitle || !newPlanet || !newStart}>
                Einsatz anlegen
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-hud-line/70 bg-black/20 p-5">
        {!selected ? (
          <div className="text-hud-muted">Wähle links einen Einsatz aus.</div>
        ) : (
          <>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-xs tracking-[0.22em] uppercase text-hud-muted">Einsatz</div>
                <h3 className="mt-2 text-2xl font-semibold">{selected.title}</h3>
                <div className="mt-2 text-sm text-hud-muted">
                  {selected.planet} • {fmtDT(selected.start_at)} {selected.end_at ? `– ${fmtDT(selected.end_at)}` : ""}
                </div>
                <div className="mt-1 text-sm text-hud-muted">{(selected.units ?? []).join(" • ") || "—"} • {selected.outcome}</div>
              </div>

              {canEdit ? (
                <label className="btn btn-ghost cursor-pointer">
                  Bild hochladen
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) uploadImage(f);
                    }}
                  />
                </label>
              ) : null}
            </div>

            {selected.image_url ? (
              <div className="mt-4 overflow-hidden rounded-2xl border border-hud-line/70">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img alt="Planet" src={selected.image_url} className="h-[260px] w-full object-cover" />
              </div>
            ) : null}

            <div className="mt-4">
              <div className="text-xs tracking-[0.22em] uppercase text-hud-muted">Verlauf</div>
              <div className="mt-2 whitespace-pre-wrap text-sm">{selected.summary || "—"}</div>
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <div>
                <div className="text-xs tracking-[0.22em] uppercase text-hud-muted">Teilnehmer</div>
                <div className="mt-2 space-y-2">
                  {(detail?.participants ?? []).map((p) => {
                    const m = rosterById.get(p.marine_card_id);
                    return (
                      <div key={p.marine_card_id} className="rounded-xl border border-hud-line/70 bg-hud-panel/30 px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-sm">
                            <span className="text-hud-muted">{m?.rank ?? "—"} • </span>
                            <span className="font-medium">{m?.name ?? p.marine_card_id}</span>
                            {p.is_lead ? <span className="ml-2 text-xs text-marine-300/90">[Leitung]</span> : null}
                          </div>
                          <button className="btn btn-ghost" onClick={() => rateMarine(p.marine_card_id, 5)} disabled={busy} title="5 Sterne (quick)">
                            +★
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {(detail?.participants ?? []).length === 0 ? <div className="text-hud-muted">Keine Teilnehmer eingetragen.</div> : null}
                </div>
              </div>

              <div>
                <div className="text-xs tracking-[0.22em] uppercase text-hud-muted">Bewertung</div>
                <div className="mt-2 flex items-center justify-between">
                  <div className="text-sm text-hud-muted">
                    Durchschnitt: <b className="text-hud-text">{avgOp || "—"}</b>
                  </div>
                  <div className="text-xs text-hud-muted">{(detail?.ratings ?? []).length} Stimmen</div>
                </div>

                <div className="mt-3 rounded-xl border border-hud-line/70 bg-hud-panel/30 p-3">
                  <div className="text-sm">Deine Bewertung</div>
                  <div className="mt-2 flex items-center gap-3">
                    <Stars value={opStars} onChange={setOpStars} />
                    <button className="btn btn-accent" onClick={rateOperation} disabled={busy || opStars < 1}>
                      Speichern
                    </button>
                  </div>
                  <textarea className="hud-input mt-3 min-h-[80px]" placeholder="Kommentar (optional)" value={opComment} onChange={(e) => setOpComment(e.target.value)} />
                </div>
              </div>
            </div>

            <div className="mt-8">
              <div className="text-xs tracking-[0.22em] uppercase text-hud-muted">Einsatzberichte</div>

              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                <div className="rounded-xl border border-hud-line/70 bg-hud-panel/30 p-3">
                  <div className="text-sm">Neuer Bericht</div>
                  <input className="hud-input mt-2" placeholder="Titel" value={repTitle} onChange={(e) => setRepTitle(e.target.value)} />
                  <textarea className="hud-input mt-2 min-h-[180px]" placeholder="Bericht (Markdown/Text)" value={repBody} onChange={(e) => setRepBody(e.target.value)} />
                  <button className="btn btn-accent mt-2" onClick={addReport} disabled={busy || !repTitle || !repBody}>
                    Bericht speichern
                  </button>
                  <div className="mt-2 text-xs text-hud-muted">Markdown geht: **fett**, *kursiv*, Listen etc.</div>
                </div>

                <div className="space-y-3">
                  {(detail?.reports ?? []).map((r) => (
                    <div key={r.id} className="rounded-xl border border-hud-line/70 bg-black/10 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-medium">{r.title}</div>
                        <div className="text-xs text-hud-muted">{fmtDT(r.created_at)}</div>
                      </div>
                      <div className="mt-2 whitespace-pre-wrap text-sm text-hud-text/90">{r.content_md}</div>
                    </div>
                  ))}
                  {(detail?.reports ?? []).length === 0 ? <div className="text-hud-muted">Noch keine Berichte.</div> : null}
                </div>
              </div>
            </div>

            {err ? (
              <div className="mt-6 rounded-xl border border-red-500/40 bg-red-950/20 p-4 text-sm">
                <div className="font-medium text-red-200">Fehler</div>
                <div className="mt-1 text-hud-muted whitespace-pre-wrap">{err}</div>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
