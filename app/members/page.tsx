"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { HudCard, TopBar } from "@/app/_components/Hud";

type ChecklistItem = { id: string; name: string; state: "complete" | "incomplete" };
type Marine = {
  id: string;
  name: string;
  url: string;
  rank: string;
  rankSince?: string | null;
  unitGroup: string;
  trainings: ChecklistItem[];
  medals: ChecklistItem[];
};

type Payload = {
  marines: Marine[];
  trainings: string[];
  medals: string[];
  lists: { id: string; name: string }[];
  absent: { id: string; name: string; url: string; rank: string; unitGroup: string; absences: { label: string; from?: string; to?: string }[] }[];
};

const norm = (s: string) => (s ?? "").trim().toLowerCase();

const RANK_ORDER = [
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

function rankIndex(rankName: string): number {
  const r = norm(rankName);
  for (let i = 0; i < RANK_ORDER.length; i++) if (r.includes(RANK_ORDER[i])) return i;
  if (r.includes("private") || r.includes("rekrut")) return 10_000;
  return 5_000;
}

function fmtDate(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("de-DE");
}

function parseJsonSafe(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export default function MembersPage() {
  const { data: session } = useSession();

  // Rollen (nur 4 Gruppen)
  const isAdmin = !!(session as any)?.isAdmin;       // Einheitsleitung
  const isFE = !!(session as any)?.canSeeFE;         // FE
  const isUO = !!(session as any)?.canSeeUO;         // UO (inkl. FE/Admin)
  const canToggleTraining = isUO;                    // UO/FE/Admin dürfen abhaken

  const canPromoteAll = isAdmin || isFE;             // FE/Admin: alles
  const canUOLimitedPromote = !canPromoteAll && isUO; // UO-only: nur Rekrut -> PFC

  const [data, setData] = useState<Payload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [qName, setQName] = useState("");
  const [qRank, setQRank] = useState<string>("all");
  const [qTraining, setQTraining] = useState<string>("all");
  const [qMedal, setQMedal] = useState<string>("all");
  const [minMedals, setMinMedals] = useState<number>(0);
  const [minTrainings, setMinTrainings] = useState<number>(0);

  const load = async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/trello", { cache: "no-store" });
      const text = await res.text();
      const json = parseJsonSafe(text);
      if (!res.ok) throw new Error(json?.error || json?.details || text || `Request failed (${res.status})`);
      setData(json as Payload);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      await load();
      if (!alive) return;
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  const ranks = useMemo(() => {
    const rs = new Set<string>();
    for (const m of data?.marines ?? []) rs.add(m.rank);
    return [...rs].sort((a, b) => {
      const ai = rankIndex(a);
      const bi = rankIndex(b);
      if (ai !== bi) return ai - bi;
      return a.localeCompare(b, "de");
    });
  }, [data]);

  const filtered = useMemo(() => {
    const marines = data?.marines ?? [];
    const nameQ = norm(qName);

    return marines
      .filter((m) => {
        if (nameQ && !norm(m.name).includes(nameQ)) return false;
        if (qRank !== "all" && m.rank !== qRank) return false;

        const medalsCount = (m.medals ?? []).filter((x) => x.state === "complete").length;
        const trainingsCount = (m.trainings ?? []).filter((x) => x.state === "complete").length;

        if (minMedals > 0 && medalsCount < minMedals) return false;
        if (minTrainings > 0 && trainingsCount < minTrainings) return false;

        if (qTraining !== "all") {
          const it = (m.trainings ?? []).find((t) => t.name === qTraining);
          if (!it) return false;
        }

        if (qMedal !== "all") {
          const it = (m.medals ?? []).find((t) => t.name === qMedal);
          if (!it) return false;
        }

        return true;
      })
      .sort((a, b) => {
        const ai = rankIndex(a.rank);
        const bi = rankIndex(b.rank);
        if (ai !== bi) return ai - bi;
        return a.name.localeCompare(b.name, "de");
      });
  }, [data, qName, qRank, qTraining, qMedal, minMedals, minTrainings]);

  const listsByRankIndex = useMemo(() => {
    const lists = data?.lists ?? [];
    return [...lists].sort((a, b) => {
      const ai = rankIndex(a.name);
      const bi = rankIndex(b.name);
      if (ai !== bi) return ai - bi;
      return a.name.localeCompare(b.name, "de");
    });
  }, [data]);

  const findAdjacentListId = (rankName: string, dir: -1 | 1): string | null => {
    const idx = rankIndex(rankName);
    const target = idx + dir;
    const candidates = listsByRankIndex.filter((l) => rankIndex(l.name) === target);
    if (candidates.length) return candidates[0].id;

    const currentPos = listsByRankIndex.findIndex((l) => rankIndex(l.name) === idx);
    if (currentPos < 0) return null;
    const next = listsByRankIndex[currentPos + dir];
    return next?.id ?? null;
  };

  // dir: -1 = hoch (Befördern), +1 = runter (Degradieren) anhand deiner Rangliste (Commander ist Index 0)
  const changeRank = async (cardId: string, currentRank: string, dir: -1 | 1) => {
    setErr(null);
    setToast(null);
    try {
      const listId = findAdjacentListId(currentRank, dir);
      if (!listId) throw new Error("Kein Ziel-Rang gefunden (Trello List fehlt?)");

      const res = await fetch("/api/trello/promote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cardId, listId }),
      });
      const text = await res.text();
      const json = parseJsonSafe(text);
      if (!res.ok) throw new Error(json?.error || json?.details || text || `Request failed (${res.status})`);
      setToast(dir === -1 ? "Beförderung durchgeführt." : "Degradierung durchgeführt.");
      await load();
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    }
  };

  const toggleTraining = async (cardId: string, checkItemId: string, nextState: "complete" | "incomplete") => {
    setErr(null);
    setToast(null);
    try {
      const res = await fetch("/api/trello/checkitem", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cardId, checkItemId, state: nextState }),
      });
      const text = await res.text();
      const json = parseJsonSafe(text);
      if (!res.ok) throw new Error(json?.error || json?.details || text || `Request failed (${res.status})`);
      setToast(nextState === "complete" ? "Fortbildung abgehakt." : "Fortbildung zurückgesetzt.");
      await load();
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    }
  };

  const allTrainings = data?.trainings ?? [];
  const allMedals = data?.medals ?? [];

  return (
    <main className="min-h-screen hud-grid px-6 py-10">
      <div className="mx-auto max-w-7xl">
        <TopBar title="Mitgliederverwaltung" subtitle="PERSONNEL / ROSTER" right={<Link href="/" className="btn btn-ghost">← Command Deck</Link>} />

        {toast ? <div className="mb-6 rounded-xl border border-hud-line/70 bg-black/20 p-3 text-sm">{toast}</div> : null}
        {err ? (
          <div className="mb-6 rounded-xl border border-marine-500/40 bg-marine-500/10 p-4 text-sm">
            <div className="font-medium">Fehler</div>
            <div className="mt-1 text-hud-muted">{err}</div>
          </div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-3">
          <HudCard title="Filter">
            <div className="grid gap-3">
              <label className="text-sm">
                <div className="text-xs text-hud-muted mb-1">Name</div>
                <input className="w-full rounded-xl border border-hud-line/80 bg-black/30 px-3 py-2 outline-none focus:border-marine-500/60"
                  value={qName} onChange={(e) => setQName(e.target.value)} placeholder="Suchen…" />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm">
                  <div className="text-xs text-hud-muted mb-1">Rang</div>
                  <select className="w-full rounded-xl border border-hud-line/80 bg-black/30 px-3 py-2 outline-none focus:border-marine-500/60"
                    value={qRank} onChange={(e) => setQRank(e.target.value)}>
                    <option value="all">Alle</option>
                    {ranks.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </label>

                <label className="text-sm">
                  <div className="text-xs text-hud-muted mb-1">Medaille</div>
                  <select className="w-full rounded-xl border border-hud-line/80 bg-black/30 px-3 py-2 outline-none focus:border-marine-500/60"
                    value={qMedal} onChange={(e) => setQMedal(e.target.value)}>
                    <option value="all">Alle</option>
                    {allMedals.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </label>
              </div>

              <label className="text-sm">
                <div className="text-xs text-hud-muted mb-1">Fortbildung (existiert auf Karte)</div>
                <select className="w-full rounded-xl border border-hud-line/80 bg-black/30 px-3 py-2 outline-none focus:border-marine-500/60"
                  value={qTraining} onChange={(e) => setQTraining(e.target.value)}>
                  <option value="all">Alle</option>
                  {allTrainings.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm">
                  <div className="text-xs text-hud-muted mb-1">Min. Medaillen (✓)</div>
                  <input type="number" min={0}
                    className="w-full rounded-xl border border-hud-line/80 bg-black/30 px-3 py-2 outline-none focus:border-marine-500/60"
                    value={minMedals} onChange={(e) => setMinMedals(Number(e.target.value || 0))} />
                </label>

                <label className="text-sm">
                  <div className="text-xs text-hud-muted mb-1">Min. Fortbildungen (✓)</div>
                  <input type="number" min={0}
                    className="w-full rounded-xl border border-hud-line/80 bg-black/30 px-3 py-2 outline-none focus:border-marine-500/60"
                    value={minTrainings} onChange={(e) => setMinTrainings(Number(e.target.value || 0))} />
                </label>
              </div>

              <button className="btn btn-ghost" onClick={() => { setQName(""); setQRank("all"); setQTraining("all"); setQMedal("all"); setMinMedals(0); setMinTrainings(0); }}>
                Reset
              </button>

              <div className="text-xs text-hud-muted">
                Trainings: <span className="text-white/70">Grün = hat er</span>, <span className="text-white/70">Grau = hat er nicht</span>.
                {canToggleTraining ? " (Klickbar: UO/FE/Einheitsleitung)" : " (Nur sichtbar)"}
              </div>
            </div>
          </HudCard>

          <HudCard title="Abmeldungen">
            {loading ? (
              <div className="text-hud-muted">Lade…</div>
            ) : (data?.absent?.length ?? 0) ? (
              <div className="space-y-2">
                {data!.absent.slice(0, 12).map((a) => (
                  <div key={a.id} className="rounded-xl border border-hud-line/70 bg-black/20 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium">{a.name}</div>
                        <div className="mt-1 text-xs text-hud-muted">{a.rank}</div>
                      </div>
                      <a href={a.url} target="_blank" rel="noreferrer" className="btn btn-ghost">Trello</a>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs">
                      {a.absences.map((ab, idx) => (
                        <span key={idx} className="chip">{ab.label} • {ab.from ?? "?"} → {ab.to ?? "?"}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-hud-muted">Keine Abmeldungen.</div>
            )}
          </HudCard>

          <HudCard title="Rechte">
            <div className="space-y-2 text-sm">
              <div>Einträge: <span className="text-white/80">{filtered.length}</span></div>
              <div>Ränge Sortierung: <span className="text-white/80">Commander → Private Rekrut</span></div>
              <div>
                Rolle:{" "}
                <span className="text-white/80">
                  {isAdmin ? "Einheitsleitung" : isFE ? "FE" : isUO ? "UO" : "Standard"}
                </span>
              </div>
              <div>
                Promote/Demote:{" "}
                <span className="text-white/80">
                  {canPromoteAll ? "ALL" : canUOLimitedPromote ? "UO: Rekrut→PFC" : "NONE"}
                </span>
              </div>
            </div>
          </HudCard>
        </div>

        <div className="mt-6 rounded-2xl border border-hud-line/80 bg-hud-panel/80 p-5 shadow-hud">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm tracking-[0.22em] uppercase text-hud-muted">Roster</h2>
            <button className="btn btn-ghost" onClick={load}>Reload</button>
          </div>

          {loading ? <div className="mt-4 text-hud-muted">Lade…</div> : null}

          <div className="mt-4 overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-[0.18em] text-hud-muted">
                  <th className="border-b border-hud-line/70 py-3 pr-4">Name</th>
                  <th className="border-b border-hud-line/70 py-3 pr-4">Rang</th>
                  <th className="border-b border-hud-line/70 py-3 pr-4">Medaillen</th>
                  <th className="border-b border-hud-line/70 py-3 pr-4">Fortbildungen</th>
                  <th className="border-b border-hud-line/70 py-3 pr-4">Aktionen</th>
                  <th className="border-b border-hud-line/70 py-3 pr-0 text-right">Trello</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((m) => {
                  const tMap = new Map((m.trainings ?? []).map((t) => [t.name, t] as const));
                  const medalDone = (m.medals ?? []).filter((x) => x.state === "complete").length;
                  const trainingDone = (m.trainings ?? []).filter((x) => x.state === "complete").length;

                  const uoOnlyAllowed = canUOLimitedPromote && norm(m.rank).includes("private rekrut");

                  return (
                    <tr key={m.id} className="align-top hover:bg-white/5">
                      <td className="border-b border-hud-line/40 py-4 pr-4">
                        <div className="font-medium">{m.name}</div>
                        <div className="mt-1 text-xs text-hud-muted">seit: {fmtDate(m.rankSince)}</div>
                      </td>

                      <td className="border-b border-hud-line/40 py-4 pr-4">
                        <span className="inline-flex items-center gap-2 rounded-full border border-hud-line/80 bg-hud-panel/50 px-3 py-1 text-xs">
                          <span className="h-1.5 w-1.5 rounded-full bg-marine-500" />
                          {m.rank}
                        </span>
                      </td>

                      <td className="border-b border-hud-line/40 py-4 pr-4">
                        <div className="text-sm font-medium">{medalDone}</div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {(m.medals ?? []).slice(0, 8).map((md) => (
                            <span key={md.id} className="chip">{md.name}{md.state === "complete" ? " ✓" : ""}</span>
                          ))}
                        </div>
                      </td>

                      <td className="border-b border-hud-line/40 py-4 pr-4 min-w-[520px]">
                        <div className="text-sm font-medium">{trainingDone} ✓</div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {allTrainings.map((tName) => {
                            const it = tMap.get(tName);
                            const done = it?.state === "complete";
                            const clickable = canToggleTraining && !!it?.id;
                            return (
                              <button
                                key={tName}
                                type="button"
                                className={
                                  "rounded-full border px-3 py-1 text-xs transition " +
                                  (done ? "border-marine-500/45 bg-marine-500/20 text-white" : "border-hud-line/50 bg-black/15 text-white/65") +
                                  (clickable ? " hover:bg-marine-500/25" : " cursor-default")
                                }
                                title={clickable ? "Klicken zum Abhaken/Zurücksetzen" : "Nicht klickbar (kein UO/FE/Admin oder Item fehlt)"}
                                onClick={() => {
                                  if (!clickable || !it) return;
                                  const next = it.state === "complete" ? "incomplete" : "complete";
                                  toggleTraining(m.id, it.id, next);
                                }}
                              >
                                {tName}
                              </button>
                            );
                          })}
                        </div>
                      </td>

                      <td className="border-b border-hud-line/40 py-4 pr-4">
                        <div className="flex flex-col gap-2">
                          <button
                            className="btn btn-accent"
                            disabled={!(canPromoteAll || uoOnlyAllowed)}
                            onClick={() => changeRank(m.id, m.rank, -1)}
                            title={canPromoteAll ? "Befördern" : uoOnlyAllowed ? "UO: Rekrut→PFC" : "Keine Rechte"}
                          >
                            Befördern
                          </button>
                          <button
                            className="btn btn-accent"
                            disabled={!canPromoteAll}
                            onClick={() => changeRank(m.id, m.rank, +1)}
                            title={canPromoteAll ? "Degradieren" : "Nur FE/Einheitsleitung"}
                          >
                            Degradieren
                          </button>
                        </div>
                      </td>

                      <td className="border-b border-hud-line/40 py-4 pr-0 text-right">
                        <a href={m.url} target="_blank" rel="noreferrer" className="btn btn-ghost">Trello</a>
                      </td>
                    </tr>
                  );
                })}

                {!filtered.length && !loading ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-hud-muted">Keine Treffer.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="mt-4 text-xs text-hud-muted">
            Hinweis: Graue Fortbildungen werden nur dann klickbar, wenn das CheckItem auf der Karte existiert. Wenn Trello nicht alle Items enthält, musst du die Trainings-Checkliste auf dem Board vorbefüllen.
          </div>
        </div>
      </div>
    </main>
  );
}
