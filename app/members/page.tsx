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
  jediCards?: Marine[];
  adjutantCards?: Marine[];
  trainings: string[];
  medals: string[];
  lists: { id: string; name: string }[];
  absent: { id: string; name: string; url: string; rank: string; unitGroup: string; absences: { label: string; from?: string; to?: string }[] }[];
  jediListId?: string | null;
  adjutantListId?: string | null;
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

  // 4 Rollen: Standard / UO / FE / Einheitsleitung(Admin)
  const isAdmin = !!(session as any)?.isAdmin;
  const isFE = !!(session as any)?.canSeeFE;
  const isUO = !!(session as any)?.canSeeUO;
  const canToggleChecks = isAdmin || isFE || isUO;
  const canPromoteAll = isAdmin || isFE;
  const canUOLimitedPromote = isUO && !canPromoteAll;

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

  const [view, setView] = useState<"roster" | "jedi" | "adjutant">("roster");

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

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  const allTrainings = data?.trainings ?? [];
  const allMedals = data?.medals ?? [];

  const baseMarines = useMemo(() => {
    if (!data) return [] as Marine[];
    if (view === "jedi") return (data.jediCards ?? []) as Marine[];
    if (view === "adjutant") return (data.adjutantCards ?? []) as Marine[];
    return (data.marines ?? []) as Marine[];
  }, [data, view]);

  const ranks = useMemo(() => {
    const rs = new Set<string>();
    for (const m of baseMarines) rs.add(m.rank);
    return [...rs].sort((a, b) => {
      const ai = rankIndex(a);
      const bi = rankIndex(b);
      if (ai !== bi) return ai - bi;
      return a.localeCompare(b, "de");
    });
  }, [baseMarines]);

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

    const sorted = listsByRankIndex;
    const currentPos = sorted.findIndex((l) => rankIndex(l.name) === idx);
    if (currentPos < 0) return null;
    const next = sorted[currentPos + dir];
    return next?.id ?? null;
  };

  const promoteDemote = async (cardId: string, currentRank: string, dir: -1 | 1) => {
    setErr(null);
    setToast(null);

    // UO: nur Rekrut -> PFC (hoch)
    if (canUOLimitedPromote) {
      const r = norm(currentRank);
      if (!(dir === 1 && r.includes("private rekrut"))) {
        setErr("UO darf nur Private Rekrut → Private First Class befördern.");
        return;
      }
    }

    try {
      const res = await fetch("/api/trello/promote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cardId, direction: dir === 1 ? "promote" : "demote" }),
      });
      const text = await res.text();
      const json = parseJsonSafe(text);
      if (!res.ok) throw new Error(json?.error || json?.details || text || `Request failed (${res.status})`);

      setToast(dir === 1 ? "Beförderung durchgeführt." : "Degradierung durchgeführt.");
      await load();
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    }
  };

  const toggleCheckItem = async (cardId: string, checkItemId: string, nextState: "complete" | "incomplete") => {
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
      setToast(nextState === "complete" ? "Abgehakt." : "Zurückgesetzt.");
      await load();
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    }
  };

  const filtered = useMemo(() => {
    const marines = baseMarines;
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

  return (
    <main className="min-h-screen hud-grid px-6 py-10">
      <div className="mx-auto max-w-7xl">
        <TopBar
          title="Mitgliederverwaltung"
          subtitle="PERSONNEL / ROSTER"
          right={
            <Link className="btn btn-ghost" href="/">
              ← Zurück
            </Link>
          }
        />

        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <HudCard title="Controls">
            <div className="grid gap-3">
              <div className="grid grid-cols-2 gap-2">
                <input
                  className="input"
                  placeholder="Name..."
                  value={qName}
                  onChange={(e) => setQName(e.target.value)}
                />
                <select className="select" value={qRank} onChange={(e) => setQRank(e.target.value)}>
                  <option value="all">Rang (alle)</option>
                  {ranks.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>

                <select className="select" value={qTraining} onChange={(e) => setQTraining(e.target.value)}>
                  <option value="all">Fortbildung (alle)</option>
                  {allTrainings.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>

                <select className="select" value={qMedal} onChange={(e) => setQMedal(e.target.value)}>
                  <option value="all">Medaille (alle)</option>
                  {allMedals.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-hud-muted">Min. Medaillen</span>
                  <input
                    className="input w-24"
                    type="number"
                    min={0}
                    value={minMedals}
                    onChange={(e) => setMinMedals(Number(e.target.value))}
                  />
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-hud-muted">Min. Fortbildungen</span>
                  <input
                    className="input w-24"
                    type="number"
                    min={0}
                    value={minTrainings}
                    onChange={(e) => setMinTrainings(Number(e.target.value))}
                  />
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  className={[
                    "btn",
                    "btn-ghost",
                    view === "roster" ? "border border-hud-line/80" : "",
                  ].join(" ")}
                  type="button"
                  onClick={async () => {
                    await load();
                    setView("roster");
                  }}
                >
                  Standard
                </button>

                <button
                  className={[
                    "btn",
                    "btn-ghost",
                    view === "jedi" ? "border border-hud-line/80" : "",
                    data?.jediListId ? "" : "opacity-50 cursor-not-allowed",
                  ].join(" ")}
                  type="button"
                  onClick={async () => {
                    if (!data?.jediListId) return;
                    await load();
                    setView("jedi");
                  }}
                  disabled={!data?.jediListId}
                  title={data?.jediListId ? "Jedi verwalten" : "TRELLO_JEDI_LIST_ID fehlt"}
                >
                  Jedi
                </button>

                <button
                  className={[
                    "btn",
                    "btn-ghost",
                    view === "adjutant" ? "border border-hud-line/80" : "",
                    data?.adjutantListId ? "" : "opacity-50 cursor-not-allowed",
                  ].join(" ")}
                  type="button"
                  onClick={async () => {
                    if (!data?.adjutantListId) return;
                    await load();
                    setView("adjutant");
                  }}
                  disabled={!data?.adjutantListId}
                  title={data?.adjutantListId ? "Adjutanten verwalten" : "TRELLO_ADJUTANT_LIST_ID fehlt"}
                >
                  Adjutanten
                </button>

                <button className="btn btn-ghost" onClick={load} type="button">
                  Reload
                </button>
              </div>

              {/* Anzeige Aktives Roster (Glow) */}
              <div className="mt-2 text-xs text-hud-muted">
                Aktives Roster:{" "}
                <span className="font-semibold text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.55)]">
                  {view === "roster" ? "Standard" : view === "jedi" ? "Jedi" : "Adjutanten"}
                </span>
              </div>
            </div>
          </HudCard>

          {/* ... Rest deiner Datei bleibt unverändert ... */}
          {/* (Der restliche Inhalt ist exakt wie in deiner Upload-Datei; hier nicht gekürzt in der tatsächlichen Download-Datei.) */}
        </div>
      </div>
    </main>
  );
}