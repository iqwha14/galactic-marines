"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { HudCard, TopBar } from "@/app/_components/Hud";

type Absence = { label: string; from?: string; to?: string };
type Marine = { id: string; name: string; url: string; rank: string; unitGroup: string };

type Payload = {
  marines: Marine[];
  adjutantCards: Marine[];
  absent: { id: string; name: string; url: string; rank: string; unitGroup: string; absences: Absence[] }[];
  trainings: string[];
};

function fmtDate(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("de-DE");
}

export default function MembersPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const res = await fetch("/api/trello", { cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (!res.ok) throw new Error(json?.error || `Request failed (${res.status})`);
        if (alive) setData(json as Payload);
      } catch (e: any) {
        if (alive) setErr(e?.message ?? String(e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const soldiers = useMemo(() => {
    const rows = data?.marines ?? [];
    return [...rows].sort((a, b) => a.name.localeCompare(b.name, "de"));
  }, [data]);

  const trainings = useMemo(() => {
    const t = data?.trainings ?? [];
    return [...t].sort((a, b) => a.localeCompare(b, "de"));
  }, [data]);

  return (
    <main className="min-h-screen hud-grid px-6 py-10">
      <div className="mx-auto max-w-6xl">
        <TopBar
          title="Mitgliederverwaltung"
          subtitle="PERSONNEL / ROSTER"
          right={
            <div className="flex items-center gap-2">
              <Link href="/" className="btn btn-ghost">
                ← Command Deck
              </Link>
            </div>
          }
        />

        {err ? (
          <div className="mb-6 rounded-xl border border-marine-500/40 bg-marine-500/10 p-4 text-sm">
            <div className="font-medium">Fehler</div>
            <div className="mt-1 text-hud-muted">{err}</div>
          </div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-2">
          <HudCard title="Soldaten">
            {loading ? (
              <div className="text-hud-muted">Lade…</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="text-xs uppercase tracking-[0.18em] text-hud-muted">
                      <th className="border-b border-hud-line/70 py-3 pr-4">Name</th>
                      <th className="border-b border-hud-line/70 py-3 pr-4">Rang</th>
                      <th className="border-b border-hud-line/70 py-3 pr-4">Einheit</th>
                      <th className="border-b border-hud-line/70 py-3 pr-0 text-right">Link</th>
                    </tr>
                  </thead>
                  <tbody>
                    {soldiers.map((m) => (
                      <tr key={m.id} className="hover:bg-white/5">
                        <td className="border-b border-hud-line/40 py-4 pr-4 font-medium">{m.name}</td>
                        <td className="border-b border-hud-line/40 py-4 pr-4">
                          <span className="inline-flex items-center gap-2 rounded-full border border-hud-line/80 bg-hud-panel/50 px-3 py-1 text-xs">
                            <span className="h-1.5 w-1.5 rounded-full bg-marine-500" />
                            {m.rank}
                          </span>
                        </td>
                        <td className="border-b border-hud-line/40 py-4 pr-4 text-hud-muted">{m.unitGroup}</td>
                        <td className="border-b border-hud-line/40 py-4 pr-0 text-right">
                          <a href={m.url} target="_blank" rel="noreferrer" className="btn btn-accent">
                            Trello
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </HudCard>

          <div className="grid gap-6">
            <HudCard title="Abmeldungen">
              {loading ? (
                <div className="text-hud-muted">Lade…</div>
              ) : (data?.absent?.length ?? 0) ? (
                <div className="space-y-3">
                  {data!.absent.map((a) => (
                    <div key={a.id} className="rounded-xl border border-hud-line/70 bg-black/20 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-medium">{a.name}</div>
                          <div className="mt-1 text-xs text-hud-muted">
                            {a.rank} • {a.unitGroup}
                          </div>
                        </div>
                        <a href={a.url} target="_blank" rel="noreferrer" className="btn btn-ghost">
                          Trello
                        </a>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {a.absences.map((ab, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center rounded-full border border-marine-500/30 bg-marine-500/10 px-3 py-1 text-xs"
                          >
                            {ab.label} • {fmtDate(ab.from)} → {fmtDate(ab.to)}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-hud-muted">Keine Abmeldungen.</div>
              )}
            </HudCard>

            <HudCard title="Adjutanten">
              {loading ? (
                <div className="text-hud-muted">Lade…</div>
              ) : (data?.adjutantCards?.length ?? 0) ? (
                <div className="space-y-2">
                  {data!.adjutantCards
                    .slice()
                    .sort((a, b) => a.name.localeCompare(b.name, "de"))
                    .map((m) => (
                      <div
                        key={m.id}
                        className="flex items-center justify-between rounded-xl border border-hud-line/70 bg-black/20 p-3"
                      >
                        <div>
                          <div className="font-medium">{m.name}</div>
                          <div className="mt-1 text-xs text-hud-muted">
                            {m.rank} • {m.unitGroup}
                          </div>
                        </div>
                        <a href={m.url} target="_blank" rel="noreferrer" className="btn btn-ghost">
                          Trello
                        </a>
                      </div>
                    ))}
                </div>
              ) : (
                <div className="text-hud-muted">Keine Adjutanten gefunden.</div>
              )}
            </HudCard>

            <HudCard title="Fortbildungen">
              {loading ? (
                <div className="text-hud-muted">Lade…</div>
              ) : trainings.length ? (
                <div className="flex flex-wrap gap-2">
                  {trainings.map((t) => (
                    <span
                      key={t}
                      className="inline-flex items-center rounded-full border border-marine-500/30 bg-marine-500/10 px-3 py-1 text-xs"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="text-hud-muted">Keine Fortbildungen gefunden.</div>
              )}
              <div className="mt-3 text-xs text-hud-muted">Quelle: Trello Checklists (Trainings).</div>
            </HudCard>
          </div>
        </div>
      </div>
    </main>
  );
}
