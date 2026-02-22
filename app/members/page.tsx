"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { HudCard, TopBar } from "@/app/_components/Hud";

/* ---------------- TYPES ---------------- */

type ChecklistItem = {
  id: string;
  name: string;
  state: "complete" | "incomplete";
};

type Marine = {
  id: string;
  name: string;
  url: string;
  rank: string;
  rankSince?: string | null;
  unitGroup: string;
  listId: string;
  trainings: ChecklistItem[];
  medals: ChecklistItem[];
};

type AbsenceItem = {
  label: string;
  from?: string | null;
  to?: string | null;
};

type AbsentEntry = {
  id: string;
  name: string;
  absences: AbsenceItem[];
};

type Payload = {
  marines: Marine[];
  trainings: string[];
  medals: string[];
  lists: { id: string; name: string }[];
  absent: AbsentEntry[];
  jediListId?: string | null;
  adjutantListId?: string | null;
};

/* ---------------- PAGE ---------------- */

export default function MembersPage() {
  const { data: session } = useSession();

  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [view, setView] = useState<"roster" | "jedi" | "adjutant">("roster");

  const load = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/trello", { cache: "no-store" });
      const json = await res.json();
      setData(json);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  /* -------- Filter je nach View -------- */

  const filteredMarines = useMemo(() => {
    if (!data) return [];

    if (view === "roster") return data.marines;

    if (view === "jedi" && data.jediListId) {
      return data.marines.filter((m) => m.listId === data.jediListId);
    }

    if (view === "adjutant" && data.adjutantListId) {
      return data.marines.filter((m) => m.listId === data.adjutantListId);
    }

    return data.marines;
  }, [data, view]);

  return (
    <main className="min-h-screen hud-grid px-6 py-10">
      <div className="mx-auto max-w-7xl">
        <TopBar
          title="Mitgliederverwaltung"
          subtitle="PERSONNEL / ROSTER"
          right={<Link href="/" className="btn btn-ghost">← Command Deck</Link>}
        />

        <div className="grid gap-6 lg:grid-cols-3">
          <HudCard title="Filter">
            <div className="grid gap-3">

              {/* -------- Buttons -------- */}

              <div className="mt-4 flex flex-wrap gap-2">

                <button
                  className="btn btn-ghost"
                  onClick={async () => {
                    await load();
                    setView("roster");
                  }}
                >
                  Standard
                </button>

                <button
                  className="btn btn-ghost"
                  onClick={async () => {
                    await load();
                    setView("jedi");
                  }}
                >
                  Jedi
                </button>

                <button
                  className="btn btn-ghost"
                  onClick={async () => {
                    await load();
                    setView("adjutant");
                  }}
                >
                  Adjutanten
                </button>

                <button
                  className="btn btn-ghost"
                  onClick={load}
                >
                  Reload
                </button>

              </div>

              <div className="text-xs text-hud-muted">
                Grün = abgeschlossen • Orange = Abmeldung
              </div>
            </div>
          </HudCard>
        </div>

<div className="mb-4 text-sm text-hud-muted">
  Aktives Roster:{" "}
  <span className="font-semibold text-white">
    {view === "roster"
      ? "Standard"
      : view === "jedi"
      ? "Jedi"
      : "Adjutanten"}
  </span>
</div>

        {/* -------- ROSTER -------- */}

        <div className="mt-6 rounded-2xl border border-hud-line/80 bg-hud-panel/80 p-5 shadow-hud">

          {loading && <div>Lade...</div>}
          {err && <div className="text-red-400">{err}</div>}

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs uppercase text-hud-muted">
                  <th>Name</th>
                  <th>Rang</th>
                  <th>Medaillen</th>
                  <th>Fortbildungen</th>
                </tr>
              </thead>
              <tbody>
                {filteredMarines.map((m) => (
                  <tr key={m.id} className="border-b border-hud-line/40">
                    <td className="py-4">{m.name}</td>
                    <td>{m.rank}</td>

                    {/* MEDAILLEN */}
                    <td className="py-4">
                      <div className="flex flex-wrap gap-2">
                        {m.medals.map((medal) => {
                          const done = medal.state === "complete";
                          return (
                            <span
                              key={medal.id}
                              className={
                                "rounded-full border px-3 py-1 text-xs " +
                                (done
                                  ? "border-green-500 bg-green-500/20 text-white"
                                  : "border-hud-line/50 bg-black/15 text-white/65")
                              }
                            >
                              {medal.name}
                            </span>
                          );
                        })}
                      </div>
                    </td>

                    {/* FORTBILDUNGEN */}
                    <td className="py-4">
                      <div className="flex flex-wrap gap-2">
                        {m.trainings.map((training) => {
                          const done = training.state === "complete";
                          return (
                            <span
                              key={training.id}
                              className={
                                "rounded-full border px-3 py-1 text-xs " +
                                (done
                                  ? "border-green-500 bg-green-500/20 text-white"
                                  : "border-hud-line/50 bg-black/15 text-white/65")
                              }
                            >
                              {training.name}
                            </span>
                          );
                        })}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* -------- ABMELDUNGEN (ORANGE) -------- */}

          {data?.absent?.map((a) => (
            <div key={a.id} className="mt-6">
              <div className="font-semibold">{a.name}</div>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                {a.absences.map((ab, idx) => (
                  <span
                    key={idx}
                    className="rounded-full border border-orange-500 bg-orange-500/15 px-3 py-1 text-xs text-orange-300"
                  >
                    {ab.label} • {ab.from ?? "?"} → {ab.to ?? "?"}
                  </span>
                ))}
              </div>
            </div>
          ))}

        </div>
      </div>
    </main>
  );
}