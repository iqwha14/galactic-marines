"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { signIn, signOut, useSession } from "next-auth/react";
import Link from "next/link";
import OpsPanel from "./OpsPanel";

type ChecklistItem = { id: string; name: string; state: "complete" | "incomplete" };
type Absence = { label: string; from?: string; to?: string };

type Marine = {
  id: string;
  name: string;
  url: string;
  rank: string;
  rankSince: string | null;
  unitGroup: string;
  absences: Absence[];
  trainings: ChecklistItem[];
  medals: ChecklistItem[];
};

type TrelloList = { id: string; name: string };

type Payload = {
  marines: Marine[];
  ranks: string[];
  lists: TrelloList[];
  trainings: string[];
  medals: string[];
  adjutantListId: string | null;
  adjutantCards: Marine[];
  jediListId: string | null;
  jediCards: Marine[];
  absent: { id: string; name: string; url: string; rank: string; unitGroup: string; absences: Absence[] }[];
};

type LogEntry = { id: string; when: string; who: string; kind: string; title: string };

const DRIVE_FOLDER_ID = "1EHiuwPpPLBC-Ti9xCNUnijyFxzVbwwTH";

type Tab = "members" | "absences" | "docs" | "ops" | "uo" | "adjutant" | "jedi" | "log";


function HudCard({
  title,
  right,
  children,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-hud-panel/80 shadow-hud border border-hud-line/80">
      <div className="scanline absolute inset-0" />
      <div className="relative p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm tracking-[0.22em] uppercase text-hud-muted">{title}</h2>
          <div className="h-px flex-1 bg-gradient-to-r from-hud-line/0 via-hud-line/80 to-hud-line/0" />
          {right ?? <span className="text-xs text-marine-300/90">GM // HUD</span>}
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="badge inline-flex items-center rounded-full px-2.5 py-1 text-xs text-hud-text/90">
      {children}
    </span>
  );
}

function Pill({ label, state }: { label: string; state: "complete" | "incomplete" }) {
  const complete = state === "complete";
  return (
    <span
      className={[
        "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs",
        complete
          ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200"
          : "border-hud-line/70 bg-black/20 text-hud-muted",
      ].join(" ")}
    >
      <span className={["h-1.5 w-1.5 rounded-full", complete ? "bg-emerald-400" : "bg-hud-line"].join(" ")} />
      {label}
    </span>
  );
}

function friendlyError(msg: string) {
  const m = (msg ?? "").toLowerCase();
  if (m.includes("not signed in")) return "Bitte zuerst mit Discord einloggen.";
  if (m.includes("editor access denied")) return "Kein Editor-Zugriff (du bist nicht freigeschaltet).";
  if (m.includes("uo access denied")) return "Kein Zugriff auf das Unteroffiziersdokument.";
  if (m.includes("google doc export failed"))
    return "Google Doc kann nicht geladen werden. (Doc muss öffentlich sein: 'Jeder mit Link: Betrachter')";

  return msg;
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("de-DE");
}

function MemberTable({
  rows,
  data,
  mode,
  canEdit,
  expanded,
  setExpanded,
  busy,
  toggleItem,
  promote,
  setErr,
}: {
  rows: Marine[];
  data: Payload | null;
  mode: "trainings" | "medals";
  canEdit: boolean;
  expanded: string | null;
  setExpanded: (v: string | null) => void;
  busy: string | null;
  toggleItem: (cardId: string, checkItemId: string, current: "complete" | "incomplete") => Promise<void>;
  promote: (cardId: string, listId: string) => Promise<void>;
  setErr: (v: string | null) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="text-xs uppercase tracking-[0.18em] text-hud-muted">
            <th className="border-b border-hud-line/70 py-3 pr-4">Mitglied</th>
            <th className="border-b border-hud-line/70 py-3 pr-4">Rang</th>
            <th className="border-b border-hud-line/70 py-3 pr-4">{mode === "trainings" ? "Fortbildungen" : "Medaillen/Orden"}</th>
            <th className="border-b border-hud-line/70 py-3 pr-0 text-right">Link</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => {
            const list = mode === "trainings" ? m.trainings : m.medals;
            const isOpen = expanded === m.id;

            return (
              <Fragment key={m.id}>
                <tr className="hover:bg-white/5 align-top">
                  <td className="border-b border-hud-line/40 py-4 pr-4">
                    <button className="text-left" onClick={() => setExpanded(isOpen ? null : m.id)} type="button">
                      <div className="font-medium">{m.name}</div>
                      <div className="mt-1 text-xs text-hud-muted">Card ID: {m.id}</div>
                    </button>
                  </td>

                  <td className="border-b border-hud-line/40 py-4 pr-4">
                    <div className="inline-flex flex-col gap-1">
                      <span className="inline-flex items-center gap-2 rounded-full border border-hud-line/80 bg-hud-panel/50 px-3 py-1 text-xs">
                        <span className="h-1.5 w-1.5 rounded-full bg-marine-500" />
                        {m.rank}
                      </span>
                      <span className="text-xs text-hud-muted">seit {fmtDate(m.rankSince)}</span>
                    </div>
                  </td>

                  <td className="border-b border-hud-line/40 py-4 pr-4">
                    <div className="flex flex-wrap gap-2">
                      {list.length ? (
                        list.slice(0, 10).map((it) => <Pill key={it.id} label={it.name} state={it.state} />)
                      ) : (
                        <span className="text-hud-muted">—</span>
                      )}
                    </div>
                  </td>

                  <td className="border-b border-hud-line/40 py-4 pr-0 text-right">
                    <a href={m.url} target="_blank" rel="noreferrer" className="btn btn-accent">
                      Trello öffnen
                    </a>
                  </td>
                </tr>

                {isOpen ? (
                  <tr>
                    <td colSpan={4} className="border-b border-hud-line/40 py-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <div className="text-xs tracking-[0.18em] uppercase text-hud-muted">Fortbildungen</div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {m.trainings.length ? (
                              m.trainings.map((it) => (
                                <button
                                  key={it.id}
                                  className={["text-left", busy === it.id ? "opacity-50" : ""].join(" ")}
                                  onClick={() => toggleItem(m.id, it.id, it.state)}
                                  disabled={!canEdit || busy === it.id}
                                  title={canEdit ? "Klicken zum Umschalten" : "Nur Editor"}
                                  type="button"
                                >
                                  <Pill label={it.name} state={it.state} />
                                </button>
                              ))
                            ) : (
                              <span className="text-hud-muted">—</span>
                            )}
                          </div>
                        </div>

                        <div>
                          <div className="text-xs tracking-[0.18em] uppercase text-hud-muted">Medaillen / Orden</div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {m.medals.length ? (
                              m.medals.map((it) => (
                                <button
                                  key={it.id}
                                  className={["text-left", busy === it.id ? "opacity-50" : ""].join(" ")}
                                  onClick={() => toggleItem(m.id, it.id, it.state)}
                                  disabled={!canEdit || busy === it.id}
                                  title={canEdit ? "Klicken zum Umschalten" : "Nur Editor"}
                                  type="button"
                                >
                                  <Pill label={it.name} state={it.state} />
                                </button>
                              ))
                            ) : (
                              <span className="text-hud-muted">—</span>
                            )}
                          </div>
                        </div>

                        <div className="md:col-span-2">
                          <div className="text-xs tracking-[0.18em] uppercase text-hud-muted">Beförderung (nur Editor)</div>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <select
                              className="hud-input max-w-[360px]"
                              defaultValue=""
                              disabled={!canEdit}
                              onChange={(e) => {
                                const listId = e.target.value;
                                if (!listId) return;
                                promote(m.id, listId).catch((e: any) => setErr(friendlyError(e?.message ?? "Promotion failed")));
                                e.target.value = "";
                              }}
                            >
                              <option value="">{canEdit ? "Rang/Liste wählen…" : "Nur Editor"}</option>
                              {(data?.lists ?? []).map((l) => (
                                <option key={l.id} value={l.id}>
                                  {l.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function AppShell({ defaultTab = "members" }: { defaultTab?: Tab }) {
  const { data: session, status: authStatus } = useSession();
  const isSignedIn = !!(session as any)?.discordId;
  const canEdit = !!(session as any)?.isEditor;
  const canSeeUO = !!(session as any)?.canSeeUO;

  const [data, setData] = useState<Payload | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [rank, setRank] = useState<string>("");
  const [mode, setMode] = useState<"trainings" | "medals">("trainings");
  const [itemFilter, setItemFilter] = useState<string>("");

  const [tab, setTab] = useState<Tab>(defaultTab);
  const [log, setLog] = useState<LogEntry[] | null>(null);

  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // UO tab
  const [uoHtml, setUoHtml] = useState<string | null>(null);
  const [uoErr, setUoErr] = useState<string | null>(null);

  async function load() {
    setErr(null);
    const res = await fetch("/api/trello", { cache: "no-store" });
    const j = await res.json();
    if (!res.ok) throw new Error(j?.details || j?.error || "Failed to load");
    setData(j);
  }

  useEffect(() => {
    load().catch((e: any) => setErr(friendlyError(e?.message ?? "Unknown error")));
  }, []);

  useEffect(() => {
    if (tab !== "log") return;
    (async () => {
      const res = await fetch("/api/log", { cache: "no-store" });
      const j = await res.json();
      if (!res.ok) {
        setErr(friendlyError(j?.details || j?.error || "Log load failed"));
        return;
      }
      setLog(j.entries ?? []);
    })();
  }, [tab]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const s = search.trim().toLowerCase();
    return data.marines.filter((m) => {
      const matchSearch = !s || m.name.toLowerCase().includes(s);
      const matchRank = !rank || m.rank === rank;
      const list = mode === "trainings" ? m.trainings : m.medals;
      const matchItem = !itemFilter || list.some((it) => it.name === itemFilter);
      return matchSearch && matchRank && matchItem;
    });
  }, [data, search, rank, mode, itemFilter]);

  const listOptions = useMemo(() => {
    if (!data) return [];
    return mode === "trainings" ? data.trainings : data.medals;
  }, [data, mode]);

  async function toggleItem(cardId: string, checkItemId: string, current: "complete" | "incomplete") {
    setBusy(checkItemId);
    try {
      const nextState = current === "complete" ? "incomplete" : "complete";
      const res = await fetch("/api/trello/checkitem", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cardId, checkItemId, state: nextState }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || j?.details || "Update failed");
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function promote(cardId: string, listId: string) {
    setBusy(cardId);
    try {
      const res = await fetch("/api/trello/promote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cardId, listId }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || j?.details || "Promotion failed");
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function loadUoDoc() {
    setUoErr(null);
    setUoHtml(null);

    const res = await fetch("/api/uo-doc", { method: "POST" });
    const j = await res.json();
    if (!res.ok) {
      setUoErr(friendlyError(j?.error || j?.details || "Load failed"));
      return;
    }
    setUoHtml(j.html ?? "");
  }

  const status = data ? "ONLINE" : err ? "ERROR" : "CONNECTING";
  const absentRows = data?.absent ?? [];

  return (
    <main className="mx-auto max-w-7xl px-4 py-10">
      <header className="mb-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs tracking-[0.35em] uppercase text-marine-300/90">EGM CW:RP</p>
            <div className="mt-2 flex items-center gap-3">
              <Link href="/" className="btn btn-ghost text-xs">← Command Deck</Link>
              <h1 className="text-3xl font-semibold">Galactic Marines Dashboard</h1>
            </div>
            <p className="mt-2 text-hud-muted">Alles zu den Marines auf EGM</p>
            <p className="mt-2 text-hud-muted">Verbunden mit Trello etc. - alles auf einer Website</p>
          </div>

          <div className="rounded-2xl border border-hud-line/70 bg-hud-panel/60 px-4 py-3 shadow-hud">
            <div className="text-xs text-hud-muted">Status</div>
            <div className="mt-1 flex items-center gap-3">
              <span
                className={[
                  "inline-flex h-2.5 w-2.5 rounded-full",
                  status === "ONLINE" ? "bg-emerald-400" : status === "ERROR" ? "bg-red-400" : "bg-marine-500",
                  "shadow-[0_0_18px_rgba(68,24,38,.35)]",
                ].join(" ")}
              />
              <span className="text-sm">{status}</span>
            </div>
          </div>
        </div>
      </header>

      <section className="grid gap-6">
        <HudCard
          title="Menu"
          right={
            <span className="text-xs text-marine-300/90">
              {authStatus === "loading" ? "…" : isSignedIn ? (canEdit ? "Editor" : "Viewer") : "Guest"}
            </span>
          }
        >
          <div className="flex flex-wrap items-start gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <button className={["btn", tab === "members" ? "btn-accent" : "btn-ghost"].join(" ")} onClick={() => setTab("members")}>
                Einheitsmitglieder
              </button>
              <button className={["btn", tab === "absences" ? "btn-accent" : "btn-ghost"].join(" ")} onClick={() => setTab("absences")}>
                Abmeldungen
              </button>
              <button className={["btn", tab === "docs" ? "btn-accent" : "btn-ghost"].join(" ")} onClick={() => setTab("docs")}>
                Einheitsdokumente
              </button>
              <button className={["btn", tab === "ops" ? "btn-accent" : "btn-ghost"].join(" ")} onClick={() => setTab("ops")}>
                Einsätze
              </button>
              <button
                className={["btn", tab === "uo" ? "btn-accent" : "btn-ghost", canSeeUO ? "" : "opacity-50 cursor-not-allowed"].join(" ")}
                onClick={() => canSeeUO && setTab("uo")}
                disabled={!canSeeUO}
                title={canSeeUO ? "" : "Kein Zugriff"}
              >
                Unteroffiziersdokument
              </button>
              <button className={["btn", tab === "log" ? "btn-accent" : "btn-ghost"].join(" ")} onClick={() => setTab("log")}>
                Log
              </button>
              <button
                className={["btn", tab === "adjutant" ? "btn-accent" : "btn-ghost", data?.adjutantListId ? "" : "opacity-50 cursor-not-allowed"].join(" ")}
                onClick={() => data?.adjutantListId && setTab("adjutant")}
                disabled={!data?.adjutantListId}
              >
                Adjutanten
              </button>
            </div>

            <div className="flex-1" />

            <div className="min-w-[280px]">
              <div className="text-xs text-hud-muted">Discord Login</div>
              <div className="mt-2 flex gap-2">
                {!isSignedIn ? (
                  <button className="btn btn-accent" onClick={() => signIn("discord")} type="button">
                    Mit Discord einloggen
                  </button>
                ) : (
                  <>
                    <button className="btn btn-ghost" onClick={() => signOut()} type="button">
                      Logout
                    </button>
                    <span className="text-xs text-hud-muted self-center">
                      {(session as any)?.user?.name ?? "Discord User"} • {canEdit ? "Editor" : "Viewer"}
                    </span>
                  </>
                )}
              </div>
              <div className="mt-2 text-xs text-hud-muted">Editor/UO-Rechte werden serverseitig über Discord-ID Allowlist vergeben.</div>
            </div>
          </div>

          {err ? (
            <div className="mt-4 rounded-xl border border-red-500/40 bg-red-950/20 p-4 text-sm">
              <div className="font-medium text-red-200">Fehler</div>
              <div className="mt-1 text-hud-muted whitespace-pre-wrap">{friendlyError(err)}</div>
            </div>
          ) : null}
        </HudCard>

        {tab === "members" ? (
          <>
            <HudCard title="Controls">
              <div className="grid gap-3 md:grid-cols-4">
                <label className="block">
                  <span className="text-xs text-hud-muted tracking-[0.22em] uppercase">Suche</span>
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name …" className="hud-input mt-2" />
                </label>

                <label className="block">
                  <span className="text-xs text-hud-muted tracking-[0.22em] uppercase">Rang</span>
                  <select value={rank} onChange={(e) => setRank(e.target.value)} className="hud-input mt-2">
                    <option value="">Alle</option>
                    {(data?.ranks ?? []).map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="text-xs text-hud-muted tracking-[0.22em] uppercase">Ansicht</span>
                  <select value={mode} onChange={(e) => setMode(e.target.value as any)} className="hud-input mt-2">
                    <option value="trainings">Fortbildungen</option>
                    <option value="medals">Medaillen/Orden</option>
                  </select>
                </label>

                <label className="block">
                  <span className="text-xs text-hud-muted tracking-[0.22em] uppercase">Filter (Item)</span>
                  <select value={itemFilter} onChange={(e) => setItemFilter(e.target.value)} className="hud-input mt-2">
                    <option value="">Alle</option>
                    {listOptions.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <Badge>Total: {data?.marines.length ?? 0}</Badge>
                <Badge>Gefiltert: {filtered.length}</Badge>
              </div>
            </HudCard>

            <HudCard
              title="Einheitsmitglieder"
              right={
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className={["btn", "btn-ghost", data?.jediListId ? "" : "opacity-50 cursor-not-allowed"].join(" ")}
                    onClick={() => data?.jediListId && setTab("jedi")}
                    disabled={!data?.jediListId}
                    title={data?.jediListId ? "Jedi verwalten" : "TRELLO_JEDI_LIST_ID fehlt"}
                  >
                    Jedi
                  </button>
                  <button
                    type="button"
                    className={["btn", "btn-ghost", data?.adjutantListId ? "" : "opacity-50 cursor-not-allowed"].join(" ")}
                    onClick={() => data?.adjutantListId && setTab("adjutant")}
                    disabled={!data?.adjutantListId}
                    title={data?.adjutantListId ? "Adjutanten verwalten" : "TRELLO_ADJUTANT_LIST_ID fehlt"}
                  >
                    Adjutanten
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={load}>
                    Reload
                  </button>
                </div>
              }
            >
              <MemberTable
                rows={filtered}
                data={data}
                mode={mode}
                canEdit={canEdit}
                expanded={expanded}
                setExpanded={setExpanded}
                busy={busy}
                toggleItem={toggleItem}
                promote={promote}
                setErr={setErr}
              />
            </HudCard>
          </>
        ) : null}

        {tab === "absences" ? (
          <HudCard title="Abmeldungen">
            <div className="mt-4 space-y-3">
              {absentRows.map((m) => (
                <div key={m.id} className="rounded-2xl border border-hud-line/70 bg-black/20 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="font-medium">{m.name}</div>
                      <div className="mt-1 text-xs text-hud-muted">
                        {m.unitGroup} • {m.rank}
                      </div>
                    </div>
                    <a className="btn btn-accent" href={m.url} target="_blank" rel="noreferrer">
                      Trello öffnen
                    </a>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {m.absences.map((a) => (
                      <span
                        key={a.label}
                        className="inline-flex items-center rounded-full border border-amber-400/30 bg-amber-500/10 px-3 py-1 text-xs text-amber-200"
                      >
                        {a.label}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
              {absentRows.length === 0 ? <div className="text-hud-muted">Keine Abmeldungen gefunden.</div> : null}
            </div>
          </HudCard>
        ) : null}

        {tab === "docs" ? (
          <HudCard title="Einheitsdokumente">
            <div className="mt-4 overflow-hidden rounded-2xl border border-hud-line/70 bg-black/20">
              <iframe title="Einheitsdokumente" className="h-[620px] w-full" src={`https://drive.google.com/embeddedfolderview?id=${DRIVE_FOLDER_ID}#list`} />
            </div>
          </HudCard>
        ) : null}

        {tab === "ops" ? (
          <HudCard title="Einsätze">
            <OpsPanel />
          </HudCard>
        ) : null}

        {tab === "uo" ? (
          <HudCard title="Unteroffiziersdokument">
            <div className="text-sm text-hud-muted">Zugriff via Discord (serverseitige Allowlist).</div>
            <button className="btn btn-accent mt-3" onClick={loadUoDoc} type="button">
              Dokument laden
            </button>

            {uoErr ? (
              <div className="mt-4 rounded-xl border border-red-500/40 bg-red-950/20 p-4 text-sm">
                <div className="font-medium text-red-200">Fehler</div>
                <div className="mt-1 text-hud-muted whitespace-pre-wrap">{uoErr}</div>
              </div>
            ) : null}

            {uoHtml ? (
              <div className="mt-4 overflow-hidden rounded-2xl border border-hud-line/70 bg-black/20">
                <iframe title="Unteroffiziersdokument" className="h-[720px] w-full" srcDoc={uoHtml} />
              </div>
            ) : (
              <div className="mt-4 text-hud-muted">Noch kein Dokument geladen.</div>
            )}
          </HudCard>
        ) : null}

        {tab === "adjutant" ? (
          <HudCard title="Adjutanten Menü">
            <div className="mt-4">
              <MemberTable
                rows={data?.adjutantCards ?? []}
                data={data}
                mode={mode}
                canEdit={canEdit}
                expanded={expanded}
                setExpanded={setExpanded}
                busy={busy}
                toggleItem={toggleItem}
                promote={promote}
                setErr={setErr}
              />
            </div>
          </HudCard>
        ) : null}

        {tab === "jedi" ? (
          <>
            <HudCard title="Jedi">
              <MemberTable
                rows={data?.jediCards ?? []}
                data={data}
                mode={mode}
                canEdit={canEdit}
                expanded={expanded}
                setExpanded={setExpanded}
                busy={busy}
                toggleItem={toggleItem}
                promote={promote}
                setErr={setErr}
              />
            </HudCard>
          </>
        ) : null}


        {tab === "log" ? (
          <HudCard title="Log Historie (Board Actions)">
            <div className="mt-4 space-y-2">
              {(log ?? []).map((e) => (
                <div key={e.id} className="rounded-xl border border-hud-line/70 bg-black/20 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm">{e.title}</div>
                    <div className="text-xs text-hud-muted">
                      {new Date(e.when).toLocaleString()} • {e.who}
                    </div>
                  </div>
                </div>
              ))}
              {log && log.length === 0 ? <div className="text-hud-muted">Keine Einträge.</div> : null}
              {!log && !err ? <div className="text-hud-muted">Lade Log…</div> : null}
            </div>
          </HudCard>
        ) : null}

        <footer className="text-center text-xs text-hud-muted">Build for Galactic Marines - made by Bit</footer>
      </section>
    </main>
  );
}

