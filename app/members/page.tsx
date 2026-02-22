"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { HudCard, TopBar } from "@/app/_components/Hud";

/* ---------------- TYPES ---------------- */

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
  absent: any[];
  jediListId?: string;
  adjutantListId?: string;
};

/* ---------------- COMPONENT ---------------- */

export default function MembersPage() {
  const { data: session } = useSession();

  const isAdmin = !!(session as any)?.isAdmin;
  const isFE = !!(session as any)?.canSeeFE;
  const isUO = !!(session as any)?.canSeeUO;
  const canToggleChecks = isAdmin || isFE || isUO;

  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

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

  useEffect(() => { load(); }, []);

  return (
    <main className="min-h-screen hud-grid px-6 py-10">
      <div className="mx-auto max-w-7xl">

        <TopBar
          title="Mitgliederverwaltung"
          subtitle="PERSONNEL / ROSTER"
          right={<Link href="/" className="btn btn-ghost">← Command Deck</Link>}
        />

        <div className="grid gap-6 lg:grid-cols-3">

          {/* FILTER */}
          <HudCard title="Filter">
            <div className="grid gap-3">

              {/* Deine bestehenden Filter bleiben hier */}

              {/* >>> NEU: JEDI / ADJUTANTEN BUTTONS <<< */}
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  className="btn btn-ghost"
                  onClick={() => window.location.href = "/jedi"}
                >
                  Jedi
                </button>

                <button
                  className="btn btn-ghost"
                  onClick={() => window.location.href = "/adjutanten"}
                >
                  Adjutanten
                </button>

                <button className="btn btn-ghost" onClick={load}>
                  Reload
                </button>
              </div>

              <div className="text-xs text-hud-muted">
                Chips: Grün = vorhanden/abgehakt, Grau = fehlt.
              </div>

            </div>
          </HudCard>

        </div>

        {/* ROSTER */}
        <div className="mt-6 rounded-2xl border border-hud-line/80 bg-hud-panel/80 p-5 shadow-hud">

          {loading ? <div>Lade...</div> : null}
          {err ? <div className="text-red-400">{err}</div> : null}

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
                {data?.marines.map((m) => (
                  <tr key={m.id} className="border-b border-hud-line/40">

                    <td className="py-4">{m.name}</td>
                    <td>{m.rank}</td>

                    {/* MEDAILLEN */}
                    <td className="py-4">
                      <div className="flex flex-wrap gap-2">
                        {m.medals.map((medal) => {
                          const done = medal.state === "complete";
                          return (
                            <button
                              key={medal.id}
                              type="button"
                              className={
                                "rounded-full border px-3 py-1 text-xs transition " +
                                (done
                                  ? "border-green-500 bg-green-500/20 text-white"
                                  : "border-hud-line/50 bg-black/15 text-white/65")
                              }
                            >
                              {medal.name}
                            </button>
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
                            <button
                              key={training.id}
                              type="button"
                              className={
                                "rounded-full border px-3 py-1 text-xs transition " +
                                (done
                                  ? "border-green-500 bg-green-500/20 text-white"
                                  : "border-hud-line/50 bg-black/15 text-white/65")
                              }
                            >
                              {training.name}
                            </button>
                          );
                        })}
                      </div>
                    </td>

                  </tr>
                ))}
              </tbody>
            </table>
          </div>

        </div>

      </div>
    </main>
  );
}