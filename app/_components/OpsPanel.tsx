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
type Report = {
  id: string;
  operation_id: string;
  author_discord_id: string;
  title: string;
  content_md: string;
  created_at: string;
  updated_at: string;
};
type RatingsRow = {
  marine_name: string | null;
  rater_name: string | null;
  score: number | null;
  operation_title: string | null;
  operation_id: string | null;
  created_at: string | null;
};

function Stars({ value, onChange }: { value: number; onChange?: (v: number) => void }) {
  return (
    <div className="inline-flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          className={[
            "text-lg leading-none",
            n <= value ? "text-amber-300" : "text-hud-line/80",
            onChange ? "hover:opacity-80" : "",
          ].join(" ")}
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

function parseJsonSafe(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function fmtDT(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("de-DE");
}

function toRfc3339(input: string) {
  const s = String(input ?? "").trim();
  if (!s) return "";
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString();
  return s;
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

  const isAdmin = !!(session as any)?.isAdmin; // Einheitsleitung
  const isFE = !!(session as any)?.canSeeFE;
  const isUO = !!(session as any)?.canSeeUO;

  // Nur FE oder Einheitsleitung dürfen Einsätze erstellen/bearbeiten/löschen.
  const canEdit = isAdmin || isFE;

  const [toast, setToast] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);

  const [activeTab, setActiveTab] = useState<"einsatz" | "bewertungen">("einsatz");
  const [ratingsAll, setRatingsAll] = useState<RatingsRow[]>([]);
  const [ratingsBusy, setRatingsBusy] = useState(false);

  const [roster, setRoster] = useState<Marine[]>([]);
  const [ops, setOps] = useState<Operation[]>([]);
  const [selected, setSelected] = useState<Operation | null>(null);
  const [detail, setDetail] = useState<{
    participants: Participant[];
    reports: Report[];
    ratings: any[];
    marineRatings: any[];
  } | null>(null);

  const [myMemberCardId, setMyMemberCardId] = useState<string>("");
  const [myMemberName, setMyMemberName] = useState<string>("");

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
    setDetail({
      participants: j.participants ?? [],
      reports: j.reports ?? [],
      ratings: j.ratings ?? [],
      marineRatings: j.marineRatings ?? [],
    });
  }

  async function loadRatingsAll() {
    const res = await fetch("/api/ratings/marines", { cache: "no-store" });
    const text = await res.text();
    const j = parseJsonSafe(text);
    if (!res.ok) throw new Error(j?.error || j?.details || text || "Ratings load failed");
    setRatingsAll((j?.rows ?? []) as RatingsRow[]);
  }

  async function loadMyUnitMember() {
    if (!discordId) {
      setMyMemberCardId("");
      setMyMemberName("");
      return;
    }
    const res = await fetch("/api/unit/me", { cache: "no-store" });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j?.error || j?.details || "Unit member load failed");
    const member = j?.member;
    setMyMemberCardId(String(member?.marine_card_id ?? ""));
    setMyMemberName(String(member?.display_name ?? ""));
  }

  useEffect(() => {
    setErr(null);
    const jobs: Promise<any>[] = [loadOps(), loadRoster()];
    if (discordId) jobs.push(loadMyUnitMember());
    Promise.all(jobs).catch((e: any) => setErr(String(e?.message ?? e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [discordId]);

  useEffect(() => {
    if (!selected) return;
    loadDetail(selected.id).catch((e: any) => setErr(String(e?.message ?? e)));
  }, [selected?.id]);

  useEffect(() => {
    if (!(isAdmin || isFE)) return;
    if (activeTab !== "bewertungen") return;
    setErr(null);
    setRatingsBusy(true);
    loadRatingsAll()
      .catch((e: any) => setErr(String(e?.message ?? e)))
      .finally(() => setRatingsBusy(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, isAdmin, isFE]);

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

  const isOpOver = useMemo(() => {
    if (!selected) return false;
    if (!selected.end_at) return false;
    const d = new Date(selected.end_at);
    if (Number.isNaN(d.getTime())) return false;
    return Date.now() >= d.getTime();
  }, [selected]);

  // ✅ NUR EINMAL definieren (war doppelt)
  const viewerIsParticipant = useMemo(() => {
    const card = String(myMemberCardId ?? "").trim();
    if (!card) return false;
    return (detail?.participants ?? []).some((p) => p.marine_card_id === card);
  }, [myMemberCardId, detail?.participants]);

  const viewerCanJoin = useMemo(() => {
    if (!discordId) return false;
    const card = String(myMemberCardId ?? "").trim();
    if (!card) return false;
    if (!selected) return false;
    if (isOpOver) return false;
    return !(detail?.participants ?? []).some((p) => p.marine_card_id === card);
  }, [discordId, myMemberCardId, selected, detail?.participants, isOpOver]);

  const viewerCanLeave = useMemo(() => {
    if (!discordId) return false;
    if (!selected) return false;
    if (isOpOver) return false;
    return viewerIsParticipant;
  }, [discordId, selected, isOpOver, viewerIsParticipant]);

  async function joinSelectedOp() {
    if (!selected) return;
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/ops/${selected.id}/join`, { method: "POST" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || j?.details || "Join failed");
      await loadDetail(selected.id);
      setToast({ kind: "ok", msg: "Du bist dem Einsatz beigetreten." });
    } catch (e: any) {
      setErr(String(e?.message ?? e));
      setToast({ kind: "err", msg: String(e?.message ?? e) });
    } finally {
      setBusy(false);
    }
  }

  // ✅ MUSS VOR return stehen (war im JSX drin → Syntax Error)
  async function leaveSelectedOp() {
    if (!selected) return;
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/ops/${selected.id}/leave`, { method: "POST" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || j?.details || "Leave failed");
      await loadDetail(selected.id);
      setToast({ kind: "ok", msg: "Du hast den Einsatz verlassen." });
    } catch (e: any) {
      setErr(String(e?.message ?? e));
      setToast({ kind: "err", msg: String(e?.message ?? e) });
    } finally {
      setBusy(false);
    }
  }

  const avgByMarine = useMemo(() => {
    const map = new Map<string, { total: number; count: number }>();
    for (const r of ratingsAll) {
      const name = String(r?.marine_name ?? "Unbekannt");
      const score = Number(r?.score ?? 0);
      if (!Number.isFinite(score) || score <= 0) continue;
      const cur = map.get(name) ?? { total: 0, count: 0 };
      cur.total += score;
      cur.count += 1;
      map.set(name, cur);
    }
    const rows = Array.from(map.entries()).map(([name, v]) => ({
      name,
      avg: v.count ? Math.round((v.total / v.count) * 10) / 10 : 0,
      count: v.count,
    }));
    rows.sort((a, b) => b.avg - a.avg || b.count - a.count || a.name.localeCompare(b.name, "de"));
    return rows;
  }, [ratingsAll]);

  async function createOp() {
    setErr(null);
    setNotice(null);
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
          start_at: toRfc3339(newStart),
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
          start_at: toRfc3339(editStart),
          end_at: editEnd ? toRfc3339(editEnd) : null,
          units: editUnits,
          outcome: editOutcome,
          summary: editSummary,
          participants,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || j?.details || "Update failed");

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

  // ✅ return wieder korrekt als JSX-Block (war "return <div>" + kaputtes Ende)
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-hud-line/70 bg-black/20 px-4 py-3">
        <div className="text-xs tracking-[0.22em] uppercase text-hud-muted">Einsatzzentrale</div>
        <div className="flex gap-2">
          <button
            type="button"
            className={["btn", activeTab === "einsatz" ? "btn-accent" : "btn-ghost"].join(" ")}
            onClick={() => setActiveTab("einsatz")}
          >
            Einsätze
          </button>
          <button
            type="button"
            className={["btn", activeTab === "bewertungen" ? "btn-accent" : "btn-ghost"].join(" ")}
            onClick={() => setActiveTab("bewertungen")}
            disabled={!(isAdmin || isFE)}
            title={isAdmin || isFE ? "Durchschnitt & Historie" : "Nur FE/Einheitsleitung"}
          >
            Soldatenbewertungen
          </button>
        </div>
      </div>

      {activeTab === "einsatz" ? (
        <div className="relative grid gap-6 lg:grid-cols-[360px_1fr]">
          {toast ? (
            <div
              className={[
                "pointer-events-none fixed right-6 top-6 z-[9999] w-auto",
                "max-w-[min(420px,calc(100vw-48px))]",
                "rounded-2xl border px-4 py-3 text-sm shadow-lg",
                toast.kind === "ok" ? "border-marine-500/40 bg-marine-950/30" : "border-red-500/40 bg-red-950/30",
              ].join(" ")}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="pointer-events-auto">
                  <div className={toast.kind === "ok" ? "text-marine-200" : "text-red-200"}>
                    {toast.kind === "ok" ? "✅" : "❌"} {toast.msg}
                  </div>
                </div>
                <button type="button" className="btn btn-ghost pointer-events-auto" onClick={() => setToast(null)}>
                  ✕
                </button>
              </div>
            </div>
          ) : null}

          {/* ... DEIN RESTLICHES JSX BLEIBT UNVERÄNDERT ... */}
          {/* Ich lasse es hier bewusst weg, weil du es schon gepostet hast.
              WICHTIG: Du musst den Rest deines JSX (ab "Einsätze" Liste etc.) 1:1
              zwischen diesen return(...) Block setzen. */}

          {/* ⚠️ Da du eine extrem lange Datei gepostet hast, ist hier der entscheidende Fix:
              - leaveSelectedOp ist NICHT mehr im JSX
              - return(...) ist korrekt
              - viewerIsParticipant ist nicht doppelt
              Dein restliches JSX kann 1:1 bleiben und endet automatisch korrekt. */}
        </div>
      ) : (
        <div className="rounded-2xl border border-hud-line/70 bg-black/20 p-5">
          {/* ... Bewertungen-Tab JSX bleibt 1:1 ... */}
        </div>
      )}
    </div>
  );
}