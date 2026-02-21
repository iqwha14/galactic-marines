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

// <input type="datetime-local"> returns YYYY-MM-DDTHH:mm (no timezone).
// Supabase expects RFC3339/ISO. Convert robustly (server normalizes too).
function toIsoFromLocal(value: string): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const m = raw.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  const candidate = m ? `${raw}:00` : raw;
  const d = new Date(candidate);
  return Number.isNaN(d.getTime()) ? raw : d.toISOString();
}

async function readError(res: Response): Promise<string> {
  const txt = await res.text().catch(() => "");
  try {
    const j = txt ? JSON.parse(txt) : {};
    const parts = [j?.error, j?.message, j?.details, j?.hint, j?.code].filter(Boolean).map(String);
    return parts.length ? parts.join("\n") : txt || `${res.status} ${res.statusText}`;
  } catch {
    return txt || `${res.status} ${res.statusText}`;
  }
}

/** Commander oben, Private unten. Major über Captain. (muss zum Trello-Parser passen) */
const rankOrder = [
  "commander",
  "major",
  "captain",
  "first lieutenant",
  "lieutenant",
  "sergeant major",
  "staff sergeant",
  "sergeant",
  "corporal",
  "lance corporal",
  "private first class",
  "private rekrut",
];
const norm = (s: string) => (s ?? "").trim().toLowerCase();
function rankIndex(rankName: string): number {
  const r = norm(rankName);
  for (let i = 0; i < rankOrder.length; i++) if (r.includes(rankOrder[i])) return i;
  if (r.includes("private") || r.includes("rekrut")) return 10_000;
  return 5_000;
}

export default function OpsPanel() {
  const { data: session } = useSession();
  const discordId = (session as any)?.discordId as string | undefined;
  const canEdit = !!(session as any)?.isEditor;

  const [toast, setToast] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);

  const [roster, setRoster] = useState<Marine[]>([]);
  const [ops, setOps] = useState<Operation[]>([]);
  const [selected, setSelected] = useState<Operation | null>(null);
  const [detail, setDetail] = useState<{ participants: Participant[]; reports: Report[]; ratings: any[]; marineRatings: any[] } | null>(null);

  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editPlanet, setEditPlanet] = useState("");
  const [editStart, setEditStart] = useState("");
  const [editEnd, setEditEnd] = useState<string>("");
  const [editOutcome, setEditOutcome] = useState("Unklar");
  const [editUnits, setEditUnits] = useState<string[]>([]);
  const [editSummary, setEditSummary] = useState("");
  const [editLead, setEditLead] = useState("");
  const [editMembers, setEditMembers] = useState<string[]>([]);
  const [editMemberPick, setEditMemberPick] = useState<string>("");

  const [newTitle, setNewTitle] = useState("");
  const [newPlanet, setNewPlanet] = useState("");
  const [newStart, setNewStart] = useState("");
  const [newOutcome, setNewOutcome] = useState("Unklar");
  const [newUnits, setNewUnits] = useState<string[]>([]);
  const [newSummary, setNewSummary] = useState("");
  const [newLead, setNewLead] = useState("");
  const [newMembers, setNewMembers] = useState<string[]>([]);
  const [memberPick, setMemberPick] = useState<string>("");

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
    // Einsätze dürfen alle ansehen. Roster ist ebenfalls öffentlich (Trello GET) – damit auch Gäste Namen/Ränge sehen.
    const jobs: Promise<any>[] = [loadOps(), loadRoster()];
    Promise.all(jobs).catch((e: any) => setErr(String(e?.message ?? e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [discordId]);

  useEffect(() => {
    if (!selected) return;
    loadDetail(selected.id).catch((e: any) => setErr(String(e?.message ?? e)));
  }, [selected?.id]);

  const rosterById = useMemo(() => new Map(roster.map((m) => [m.id, m])), [roster]);

  const rosterSortedByRank = useMemo(() => {
    const copy = [...roster];
    copy.sort((a, b) => {
      const ai = rankIndex(a.rank);
      const bi = rankIndex(b.rank);
      if (ai !== bi) return ai - bi;
      return a.name.localeCompare(b.name, "de");
    });
    return copy;
  }, [roster]);

  const avgOp = useMemo(() => {
    const r = detail?.ratings ?? [];
    if (!r.length) return 0;
    return Math.round((r.reduce((a: any, b: any) => a + (Number(b.stars) || 0), 0) / r.length) * 10) / 10;
  }, [detail?.ratings]);

  async function createOp() {
    setErr(null);
    setNotice(null);
    setBusy(true);
    try {
      if (!newTitle.trim() || !newPlanet.trim() || !newStart.trim()) {
        throw new Error("Bitte Titel, Planet und Startzeit ausfüllen.");
      }

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
          start_at: toIsoFromLocal(newStart),
          units: newUnits,
          outcome: newOutcome,
          summary: newSummary,
          participants,
        }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j ? [j?.error, j?.details, j?.hint, j?.code].filter(Boolean).join("\n") : await readError(res));

      setNewTitle("");
      setNewPlanet("");
      setNewStart("");
      setNewUnits([]);
      setNewOutcome("Unklar");
      setNewSummary("");
      setNewLead("");
      setNewMembers([]);
      setMemberPick("");
      await loadOps();
      setSelected(j.operation);
      setNotice("✅ Einsatz wurde erfolgreich angelegt.");
      setToast({ kind: "ok", msg: "Einsatz erfolgreich angelegt." });
    } catch (e: any) {
      setErr(String(e?.message ?? e));
      setToast({ kind: "err", msg: String(e?.message ?? e) });
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
      setToast({ kind: "ok", msg: "Bild erfolgreich hochgeladen." });
    } catch (e: any) {
      setErr(String(e?.message ?? e));
      setToast({ kind: "err", msg: String(e?.message ?? e) });
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
      setToast({ kind: "ok", msg: "Bewertung gespeichert." });
    } catch (e: any) {
      setErr(String(e?.message ?? e));
      setToast({ kind: "err", msg: String(e?.message ?? e) });
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
      setToast({ kind: "ok", msg: "Soldatenbewertung gespeichert." });
    } catch (e: any) {
      setErr(String(e?.message ?? e));
      setToast({ kind: "err", msg: String(e?.message ?? e) });
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
      setToast({ kind: "ok", msg: "Bericht gespeichert." });
    } catch (e: any) {
      setErr(String(e?.message ?? e));
      setToast({ kind: "err", msg: String(e?.message ?? e) });
    } finally {
      setBusy(false);
    }
  }

  function openEdit() {
    if (!selected) return;
    setEditOpen(true);
    setEditTitle(selected.title ?? "");
    setEditPlanet(selected.planet ?? "");
    // datetime-local needs "YYYY-MM-DDTHH:mm"
    const start = selected.start_at ? new Date(selected.start_at) : null;
    const end = selected.end_at ? new Date(selected.end_at) : null;
    const fmtLocal = (d: Date | null) => {
      if (!d || Number.isNaN(d.getTime())) return "";
      const pad = (n: number) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };
    setEditStart(fmtLocal(start));
    setEditEnd(fmtLocal(end));
    setEditOutcome(selected.outcome ?? "Unklar");
    setEditUnits(Array.isArray(selected.units) ? selected.units : []);
    setEditSummary(selected.summary ?? "");

    const parts = detail?.participants ?? [];
    const lead = parts.find((p) => p.is_lead)?.marine_card_id ?? "";
    const members = parts.filter((p) => !p.is_lead).map((p) => p.marine_card_id);
    setEditLead(lead);
    setEditMembers(members);
    setEditMemberPick("");
  }

  async function saveEdit() {
    if (!selected) return;
    setErr(null);
    setBusy(true);
    try {
      if (!editTitle.trim() || !editPlanet.trim() || !editStart.trim()) {
        throw new Error("Bitte Titel, Planet und Startzeit ausfüllen.");
      }

      const participants = [
        ...editMembers.map((id) => ({ marine_card_id: id, role: null, is_lead: false })),
        ...(editLead ? [{ marine_card_id: editLead, role: "Einsatzleitung", is_lead: true }] : []),
      ].reduce((acc: any[], p: any) => {
        if (!p.marine_card_id) return acc;
        if (acc.some((x) => x.marine_card_id === p.marine_card_id)) return acc;
        acc.push(p);
        return acc;
      }, []);

      const res = await fetch(`/api/ops/${selected.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: editTitle,
          planet: editPlanet,
          start_at: toIsoFromLocal(editStart),
          end_at: editEnd ? toIsoFromLocal(editEnd) : null,
          units: editUnits,
          outcome: editOutcome,
          summary: editSummary,
          participants,
        }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j ? [j?.error, j?.details, j?.hint, j?.code].filter(Boolean).join("\n") : await readError(res));

      await loadOps();
      setSelected(j.operation);
      await loadDetail(selected.id);
      setEditOpen(false);
      setToast({ kind: "ok", msg: "Einsatz aktualisiert." });
    } catch (e: any) {
      setErr(String(e?.message ?? e));
      setToast({ kind: "err", msg: String(e?.message ?? e) });
    } finally {
      setBusy(false);
    }
  }

  async function deleteOp() {
    if (!selected) return;
    if (!confirm(`Einsatz wirklich löschen?\n\n${selected.title}`)) return;
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/ops/${selected.id}`, { method: "DELETE" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || j?.details || "Delete failed");
      setSelected(null);
      setDetail(null);
      await loadOps();
      setToast({ kind: "ok", msg: "Einsatz gelöscht." });
    } catch (e: any) {
      setErr(String(e?.message ?? e));
      setToast({ kind: "err", msg: String(e?.message ?? e) });
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4200);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <div className="relative grid gap-6 lg:grid-cols-[360px_1fr]">
      {toast ? (
        <div
          className={[
            "pointer-events-none absolute right-0 top-0 z-20 w-full max-w-[520px]",
            "rounded-2xl border px-4 py-3 text-sm shadow-lg",
            toast.kind === "ok" ? "border-marine-500/40 bg-marine-950/30" : "border-red-500/40 bg-red-950/30",
          ].join(" ")}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="pointer-events-auto">
              <div className={toast.kind === "ok" ? "text-marine-200" : "text-red-200"}>{toast.kind === "ok" ? "✅" : "❌"} {toast.msg}</div>
            </div>
            <button type="button" className="btn btn-ghost pointer-events-auto" onClick={() => setToast(null)}>
              ✕
            </button>
          </div>
        </div>
      ) : null}

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
            <div className="mt-2 text-sm text-hud-muted">Nur Editor kann Einsätze anlegen/bearbeiten/löschen. Ansehen darf jeder.</div>
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
                {rosterSortedByRank.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.rank} • {m.name}
                  </option>
                ))}
              </select>

              <label className="text-xs text-hud-muted">Teilnehmer</label>
              <div className="grid gap-2">
                <div className="flex gap-2">
                  <select className="hud-input" value={memberPick} onChange={(e) => setMemberPick(e.target.value)}>
                    <option value="">— auswählen —</option>
                    {rosterSortedByRank
                      .filter((m) => m.id !== newLead)
                      .filter((m) => !newMembers.includes(m.id))
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.rank} • {m.name}
                        </option>
                      ))}
                  </select>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={busy || !memberPick}
                    onClick={() => {
                      if (!memberPick) return;
                      setNewMembers((prev) => (prev.includes(memberPick) ? prev : [...prev, memberPick]));
                      setMemberPick("");
                    }}
                  >
                    Hinzufügen
                  </button>
                </div>

                <div className="flex flex-wrap gap-2">
                  {newMembers.length ? (
                    newMembers.map((id) => {
                      const m = rosterById.get(id);
                      return (
                        <button
                          key={id}
                          type="button"
                          className="badge px-3 py-1 rounded-full border text-xs border-hud-line/70 bg-black/20 hover:bg-white/5"
                          title="Entfernen"
                          onClick={() => setNewMembers((prev) => prev.filter((x) => x !== id))}
                        >
                          {m ? `${m.rank} • ${m.name}` : id} ✕
                        </button>
                      );
                    })
                  ) : (
                    <div className="text-xs text-hud-muted">Noch keine Teilnehmer ausgewählt.</div>
                  )}
                </div>
              </div>

              <button className="btn btn-accent" onClick={createOp} disabled={busy || !newTitle || !newPlanet || !newStart}>
                Einsatz anlegen
              </button>

              {notice ? <div className="mt-2 rounded-xl border border-marine-500/40 bg-marine-950/20 p-3 text-sm">{notice}</div> : null}
              {err ? (
                <div className="mt-2 rounded-xl border border-red-500/40 bg-red-950/20 p-3 text-sm">
                  <div className="font-medium text-red-200">Fehler</div>
                  <div className="mt-1 text-hud-muted whitespace-pre-wrap">{err}</div>
                </div>
              ) : null}
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
                <div className="flex flex-wrap items-center gap-2">
                  <button className="btn btn-ghost" type="button" onClick={openEdit} disabled={busy}>
                    Bearbeiten
                  </button>
                  <button className="btn btn-ghost" type="button" onClick={deleteOp} disabled={busy}>
                    Löschen
                  </button>
                  <label className="btn btn-ghost cursor-pointer">
                    Bild hochladen
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) uploadImage(f);
                        // allow re-upload same file
                        if (e.currentTarget) e.currentTarget.value = "";
                      }}
                    />
                  </label>
                </div>
              ) : null}
            </div>

            {canEdit && editOpen ? (
              <div className="mt-4 rounded-2xl border border-hud-line/70 bg-hud-panel/30 p-4">
                <div className="text-xs tracking-[0.22em] uppercase text-hud-muted">Einsatz bearbeiten</div>
                <div className="mt-3 grid gap-2">
                  <input className="hud-input" placeholder="Titel" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
                  <input className="hud-input" placeholder="Planet / Map" value={editPlanet} onChange={(e) => setEditPlanet(e.target.value)} />
                  <div className="grid gap-2 md:grid-cols-2">
                    <input className="hud-input" type="datetime-local" value={editStart} onChange={(e) => setEditStart(e.target.value)} />
                    <input className="hud-input" type="datetime-local" value={editEnd} onChange={(e) => setEditEnd(e.target.value)} />
                  </div>
                  <select className="hud-input" value={editOutcome} onChange={(e) => setEditOutcome(e.target.value)}>
                    {['Unklar', 'Sieg', 'Teilerfolg', 'Rückzug', 'Niederlage'].map((x) => (
                      <option key={x} value={x}>
                        {x}
                      </option>
                    ))}
                  </select>

                  <label className="text-xs text-hud-muted">Einheiten</label>
                  <div className="flex flex-wrap gap-2">
                    {['Haupteinheit', 'Galactic Marine Elite', '44th'].map((u) => (
                      <button
                        key={u}
                        type="button"
                        className={[
                          "badge px-3 py-1 rounded-full border text-xs",
                          editUnits.includes(u) ? "border-marine-500/60 bg-marine-500/10" : "border-hud-line/70 bg-black/20",
                        ].join(" ")}
                        onClick={() => setEditUnits((prev) => (prev.includes(u) ? prev.filter((x) => x !== u) : [...prev, u]))}
                      >
                        {u}
                      </button>
                    ))}
                  </div>

                  <textarea className="hud-input min-h-[90px]" placeholder="Verlauf (kurz)" value={editSummary} onChange={(e) => setEditSummary(e.target.value)} />

                  <label className="text-xs text-hud-muted">Einsatzleitung</label>
                  <select className="hud-input" value={editLead} onChange={(e) => setEditLead(e.target.value)}>
                    <option value="">—</option>
                    {rosterSortedByRank.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.rank} • {m.name}
                      </option>
                    ))}
                  </select>

                  <label className="text-xs text-hud-muted">Teilnehmer</label>
                  <div className="grid gap-2">
                    <div className="flex gap-2">
                      <select className="hud-input" value={editMemberPick} onChange={(e) => setEditMemberPick(e.target.value)}>
                        <option value="">— auswählen —</option>
                        {rosterSortedByRank
                          .filter((m) => m.id !== editLead)
                          .filter((m) => !editMembers.includes(m.id))
                          .map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.rank} • {m.name}
                            </option>
                          ))}
                      </select>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        disabled={busy || !editMemberPick}
                        onClick={() => {
                          if (!editMemberPick) return;
                          setEditMembers((prev) => (prev.includes(editMemberPick) ? prev : [...prev, editMemberPick]));
                          setEditMemberPick("");
                        }}
                      >
                        Hinzufügen
                      </button>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {editMembers.length ? (
                        editMembers.map((id) => {
                          const m = rosterById.get(id);
                          return (
                            <button
                              key={id}
                              type="button"
                              className="badge px-3 py-1 rounded-full border text-xs border-hud-line/70 bg-black/20 hover:bg-white/5"
                              title="Entfernen"
                              onClick={() => setEditMembers((prev) => prev.filter((x) => x !== id))}
                            >
                              {m ? `${m.rank} • ${m.name}` : id} ✕
                            </button>
                          );
                        })
                      ) : (
                        <div className="text-xs text-hud-muted">Noch keine Teilnehmer ausgewählt.</div>
                      )}
                    </div>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-2">
                    <button className="btn btn-accent" type="button" onClick={saveEdit} disabled={busy || !editTitle || !editPlanet || !editStart}>
                      Speichern
                    </button>
                    <button
                      className="btn btn-ghost"
                      type="button"
                      onClick={() => {
                        setEditOpen(false);
                      }}
                      disabled={busy}
                    >
                      Abbrechen
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

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
                          <button
                            className="btn btn-ghost"
                            onClick={() => rateMarine(p.marine_card_id, 5)}
                            disabled={!discordId || busy}
                            title={discordId ? "5 Sterne (quick)" : "Login erforderlich"}
                          >
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
                    <Stars value={opStars} onChange={discordId ? setOpStars : undefined} />
                    <button className="btn btn-accent" onClick={rateOperation} disabled={!discordId || busy || opStars < 1}>
                      Speichern
                    </button>
                  </div>
                  <textarea
                    className="hud-input mt-3 min-h-[80px]"
                    placeholder={discordId ? "Kommentar (optional)" : "Login erforderlich für Bewertungen"}
                    value={opComment}
                    onChange={(e) => setOpComment(e.target.value)}
                    disabled={!discordId}
                  />
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
                  <button className="btn btn-accent mt-2" onClick={addReport} disabled={!discordId || busy || !repTitle || !repBody}>
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

            {!discordId ? (
              <div className="mt-6 rounded-xl border border-hud-line/70 bg-black/10 p-4 text-sm text-hud-muted">
                Du bist nicht eingeloggt. Du kannst alle Einsätze ansehen – aber bewerten und Berichte schreiben geht nur mit Discord-Login.
              </div>
            ) : null}

            {/* Fehler im Detail-Bereich (z.B. Upload/Rating/Report) */}
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
