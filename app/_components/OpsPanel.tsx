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
  status?: string | null;
  map_grid?: string | null;
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
  comment?: string | null;
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

function gridToPercent(gridRaw: string | null | undefined): { x: number; y: number } | null {
  const g = String(gridRaw ?? "").trim().toUpperCase();
  // Formats like "M-10" or "M10"
  const m = g.match(/^([A-U])\s*[- ]?\s*(\d{1,2})$/);
  if (!m) return null;
  const letter = m[1];
  const n = Number(m[2]);
  if (!Number.isFinite(n) || n <= 0) return null;
  const maxCols = 21; // A-U
  const maxRows = 21; // 1-21 (fits most map grids)
  const col = letter.charCodeAt(0) - "A".charCodeAt(0) + 1;
  const row = n;
  const x = ((col - 1) / (maxCols - 1)) * 100;
  const y = ((row - 1) / (maxRows - 1)) * 100;
  return { x, y };
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
    killlogs: any[];
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

  // Canon galaxy map (user provided). Try JPG first; fall back to PNG if the host blocks JPG.
  const [mapImgSrc, setMapImgSrc] = useState<string>("https://i.imgur.com/zGYMR82.jpg");
  const [newSummary, setNewSummary] = useState("");
  const [newLead, setNewLead] = useState("");
  const [newMembers, setNewMembers] = useState<string[]>([]);
  const [memberPick, setMemberPick] = useState<string>("");

  const [opStars, setOpStars] = useState(0);
  const [opComment, setOpComment] = useState("");
  const [repTitle, setRepTitle] = useState("");
  const [repBody, setRepBody] = useState("");

  const [killDeaths, setKillDeaths] = useState<number>(1);
  const [killText, setKillText] = useState<string>("");

  const [rateModal, setRateModal] = useState<{
    open: boolean;
    marine_card_id: string;
    marine_label: string;
    stars: number;
    comment: string;
  }>({ open: false, marine_card_id: "", marine_label: "", stars: 0, comment: "" });

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
      killlogs: j.killlogs ?? [],
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

  const killAgg = useMemo(() => {
    const rows = detail?.killlogs ?? [];
    const map = new Map<string, number>();
    for (const r of rows) {
      // If the text looks like a SWRP kill log line, count deaths by the VICTIM.
      // Example: "Esk killed Calm using weapon_swrp_fusioncutter"
      const t = String((r as any)?.text ?? "");
      const m = t.match(/^(.+?)\s+killed\s+(.+?)\s+using\s+(.+?)\s*$/i);
      const victim = m ? String(m[2]).trim() : "";
      const key = victim || String((r as any)?.display_name ?? (r as any)?.marine_card_id ?? (r as any)?.discord_id ?? "Unbekannt");
      const deaths = Number((r as any)?.deaths ?? 0);
      if (!Number.isFinite(deaths) || deaths <= 0) continue;
      map.set(key, (map.get(key) ?? 0) + deaths);
    }
    const list = Array.from(map.entries()).map(([name, deaths]) => ({ name, deaths }));
    list.sort((a, b) => b.deaths - a.deaths || a.name.localeCompare(b.name, "de"));
    return list;
  }, [detail?.killlogs]);

  
  const isOpOver = useMemo(() => {
    if (!selected) return false;
    if (!selected.end_at) return false;
    const d = new Date(selected.end_at);
    if (Number.isNaN(d.getTime())) return false;
    return Date.now() >= d.getTime();
  }, [selected]);

  const viewerIsParticipant = useMemo(() => {
    const card = String(myMemberCardId ?? "").trim();
    if (!card) return false;
    return (detail?.participants ?? []).some((p) => p.marine_card_id === card);
  }, [detail?.participants, myMemberCardId]);

  // If the creator created the op and was already added by FE as lead/participant,
  // they might not yet have a gm_unit_members mapping. Allow them to rate anyway.
  const viewerIsCreator = useMemo(() => {
    if (!discordId) return false;
    if (!selected) return false;
    return String(selected.created_by_discord_id ?? "").trim() === String(discordId).trim();
  }, [discordId, selected]);

  const viewerMayRate = useMemo(() => {
    return viewerIsParticipant || viewerIsCreator;
  }, [viewerIsParticipant, viewerIsCreator]);

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

  async function rateMarine(marine_card_id: string, stars: number, comment: string) {
    if (!selected) return;
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/ops/${selected.id}/rate-marine`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ marine_card_id, stars, comment }),
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

  async function submitKilllog() {
    if (!selected) return;
    setErr(null);
    setBusy(true);
    try {
      const lines = String(killText ?? "")
        .split(/\r?\n/)
        .map((x) => x.trim())
        .filter(Boolean)
        .slice(0, 50);

      const payload = lines.length > 1 ? { lines } : { deaths: killDeaths, text: killText };
      const res = await fetch(`/api/ops/${selected.id}/killlogs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || j?.details || "Killlog failed");
      setKillDeaths(1);
      setKillText("");
      await loadDetail(selected.id);
      setToast({ kind: "ok", msg: "Killlog gespeichert." });
    } catch (e: any) {
      setErr(String(e?.message ?? e));
      setToast({ kind: "err", msg: String(e?.message ?? e) });
    } finally {
      setBusy(false);
    }
  }

  async function setOpStatus(nextStatus: string) {
    if (!selected) return;
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/ops/${selected.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || j?.details || "Status update failed");
      await loadOps();
      await loadDetail(selected.id);
      setToast({ kind: "ok", msg: "Status aktualisiert." });
    } catch (e: any) {
      setErr(String(e?.message ?? e));
      setToast({ kind: "err", msg: String(e?.message ?? e) });
    } finally {
      setBusy(false);
    }
  }

  async function setOpMapGrid(nextGrid: string) {
    if (!selected) return;
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/ops/${selected.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ map_grid: nextGrid }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || j?.details || "Map update failed");
      await loadOps();
      await loadDetail(selected.id);
      setToast({ kind: "ok", msg: "Koordinate gespeichert." });
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

          {rateModal.open ? (
            <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/70 p-4">
              <div className="w-full max-w-lg rounded-2xl border border-hud-line/70 bg-[#05070c] p-5 shadow-xl">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs tracking-[0.22em] uppercase text-hud-muted">Soldatenbewertung</div>
                    <div className="mt-2 text-lg font-semibold">{rateModal.marine_label}</div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setRateModal({ open: false, marine_card_id: "", marine_label: "", stars: 0, comment: "" })}
                  >
                    ✕
                  </button>
                </div>

                <div className="mt-4">
                  <div className="text-sm text-hud-muted">Sterne vergeben</div>
                  <div className="mt-2">
                    <Stars value={rateModal.stars} onChange={(n) => setRateModal((s) => ({ ...s, stars: n }))} />
                  </div>

                  <div className="mt-4 text-sm text-hud-muted">Grund (Pflicht)</div>
                  <textarea
                    className="hud-input mt-2 min-h-[110px]"
                    placeholder="Warum? (muss ausgefüllt sein)"
                    value={rateModal.comment}
                    onChange={(e) => setRateModal((s) => ({ ...s, comment: e.target.value }))}
                  />

                  <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => setRateModal({ open: false, marine_card_id: "", marine_label: "", stars: 0, comment: "" })}
                      disabled={busy}
                    >
                      Abbrechen
                    </button>
                    <button
                      type="button"
                      className="btn btn-accent"
                      disabled={busy || !discordId || rateModal.stars <= 0 || !rateModal.comment.trim()}
                      onClick={async () => {
                        const target = rateModal.marine_card_id;
                        const stars = rateModal.stars;
                        const comment = rateModal.comment;
                        setRateModal((s) => ({ ...s, open: false }));
                        await rateMarine(target, stars, comment);
                        setRateModal({ open: false, marine_card_id: "", marine_label: "", stars: 0, comment: "" });
                      }}
                    >
                      Speichern
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          <div className="rounded-2xl border border-hud-line/70 bg-black/20 p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs tracking-[0.22em] uppercase text-hud-muted">Einsätze</div>
              <button
                className="btn btn-ghost"
                onClick={() => loadOps().catch((e: any) => setErr(String(e?.message ?? e)))}
                disabled={busy}
              >
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
                    selected?.id === o.id
                      ? "border-marine-500/60 bg-marine-500/10"
                      : "border-hud-line/60 bg-hud-panel/30 hover:bg-white/5",
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
                <div className="mt-2 text-sm text-hud-muted">Nur FE/Einheitsleitung kann Einsätze anlegen/bearbeiten/löschen. Ansehen darf jeder.</div>
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
                        className="btn btn-ghost"
                        type="button"
                        onClick={() => {
                          if (!memberPick) return;
                          setNewMembers((prev) => (prev.includes(memberPick) ? prev : [...prev, memberPick]));
                          setMemberPick("");
                        }}
                      >
                        Hinzufügen
                      </button>
                    </div>

                    {newMembers.length ? (
                      <div className="flex flex-wrap gap-2">
                        {newMembers.map((id) => {
                          const m = rosterById.get(id);
                          return (
                            <button
                              key={id}
                              type="button"
                              className="chip"
                              onClick={() => setNewMembers((prev) => prev.filter((x) => x !== id))}
                              title="Entfernen"
                            >
                              {m ? `${m.rank} • ${m.name}` : id} ×
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-xs text-hud-muted">—</div>
                    )}
                  </div>

                  <button className="btn btn-accent" onClick={createOp} disabled={busy || !newTitle || !newPlanet || !newStart}>
                    Einsatz anlegen
                  </button>

                  {notice ? <div className="text-sm text-marine-200">{notice}</div> : null}
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

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-hud-line/70 bg-black/20 px-3 py-1 text-xs text-hud-muted">
                        Status: <span className="text-hud-text">{String(selected.status ?? "Bevorstehend")}</span>
                      </span>
                      {canEdit ? (
                        <select
                          className="hud-input !h-9 !py-0 !text-sm"
                          value={String(selected.status ?? "Bevorstehend")}
                          onChange={(e) => setOpStatus(e.target.value)}
                          disabled={busy}
                          title="Einsatzstatus ändern"
                        >
                          <option value="Bevorstehend">Bevorstehend</option>
                          <option value="Aktiv">Aktiv</option>
                          <option value="Beendet">Beendet</option>
                        </select>
                      ) : null}
                    </div>
                  </div>

                  {canEdit ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <button className="btn btn-ghost" onClick={openEdit} disabled={busy}>
                        Bearbeiten
                      </button>
                      <button className="btn btn-ghost" onClick={deleteOp} disabled={busy}>
                        Löschen
                      </button>
                    </div>
                  ) : null}
                </div>

                {canEdit && editOpen ? (
                  <div className="mt-4 rounded-2xl border border-hud-line/70 bg-black/10 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs tracking-[0.22em] uppercase text-hud-muted">Bearbeiten</div>
                      <button className="btn btn-ghost" onClick={() => setEditOpen(false)} disabled={busy}>
                        Schließen
                      </button>
                    </div>

                    <div className="mt-3 grid gap-2">
                      <input className="hud-input" placeholder="Titel" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
                      <input className="hud-input" placeholder="Planet / Map" value={editPlanet} onChange={(e) => setEditPlanet(e.target.value)} />
                      <input className="hud-input" type="datetime-local" value={editStart} onChange={(e) => setEditStart(e.target.value)} />
                      <input className="hud-input" type="datetime-local" value={editEnd} onChange={(e) => setEditEnd(e.target.value)} />
                      <select className="hud-input" value={editOutcome} onChange={(e) => setEditOutcome(e.target.value)}>
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
                            className="btn btn-ghost"
                            type="button"
                            onClick={() => {
                              if (!editMemberPick) return;
                              setEditMembers((prev) => (prev.includes(editMemberPick) ? prev : [...prev, editMemberPick]));
                              setEditMemberPick("");
                            }}
                          >
                            Hinzufügen
                          </button>
                        </div>

                        {editMembers.length ? (
                          <div className="flex flex-wrap gap-2">
                            {editMembers.map((id) => {
                              const m = rosterById.get(id);
                              return (
                                <button
                                  key={id}
                                  type="button"
                                  className="chip"
                                  onClick={() => setEditMembers((prev) => prev.filter((x) => x !== id))}
                                  title="Entfernen"
                                >
                                  {m ? `${m.rank} • ${m.name}` : id} ×
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="text-xs text-hud-muted">—</div>
                        )}
                      </div>

                      <div className="mt-2 flex gap-2">
                        <button className="btn btn-accent" onClick={saveEdit} disabled={busy || !editTitle || !editPlanet || !editStart}>
                          Speichern
                        </button>
                        <button className="btn btn-ghost" onClick={() => setEditOpen(false)} disabled={busy}>
                          Abbrechen
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}

                {selected.image_url ? (
                  <div className="mt-4 overflow-hidden rounded-2xl border border-hud-line/70">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={selected.image_url} alt="Einsatzbild" className="h-[280px] w-full object-cover" />
                  </div>
                ) : null}

                {canEdit ? (
                  <div className="mt-3">
                    <label className="btn btn-ghost">
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
                  </div>
                ) : null}

                <div className="mt-6 grid gap-6 lg:grid-cols-2">
                  <div className="rounded-2xl border border-hud-line/70 bg-black/10 p-4">
                    <div className="text-xs tracking-[0.22em] uppercase text-hud-muted">Teilnehmer</div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                      <div className="text-xs text-hud-muted">
                        {discordId ? (
                          myMemberCardId ? (
                            <>Angemeldet als <span className="text-white/80">{myMemberName || discordId}</span></>
                          ) : (
                            <>Du bist nicht als Einheit-Mitglied hinterlegt (Admin muss dich eintragen).</>
                          )
                        ) : (
                          <>Login nötig, um beizutreten.</>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {viewerIsParticipant ? (
                          <button
                            className={"btn btn-ghost"}
                            type="button"
                            onClick={leaveSelectedOp}
                            disabled={!viewerCanLeave || busy}
                            title={viewerCanLeave ? "Einsatz verlassen" : isOpOver ? "Einsatz vorbei" : "Nicht möglich"}
                          >
                            Einsatz verlassen
                          </button>
                        ) : (
                          <button
                            className={"btn btn-ghost"}
                            type="button"
                            onClick={joinSelectedOp}
                            disabled={!viewerCanJoin || busy}
                            title={viewerCanJoin ? "Einsatz beitreten" : isOpOver ? "Einsatz vorbei" : "Nicht möglich"}
                          >
                            Einsatz beitreten
                          </button>
                        )}
                        {isOpOver ? <span className="text-xs text-hud-muted">Beitritt deaktiviert (Einsatz vorbei).</span> : null}
                      </div>
                    </div>
                    <div className="mt-3 space-y-2">
                      {(detail?.participants ?? []).map((p) => {
                        const m = rosterById.get(p.marine_card_id);
                        return (
                          <div key={p.marine_card_id} className="rounded-xl border border-hud-line/60 bg-black/10 p-3">
                            <div className="flex items-center justify-between gap-2">
                              <div className="font-medium">{m ? `${m.rank} • ${m.name}` : p.marine_card_id}</div>
                              <div className="text-xs text-hud-muted">{p.is_lead ? "Einsatzleitung" : "Teilnehmer"}</div>
                            </div>
                            <div className="mt-1 text-xs text-hud-muted">{m?.unitGroup ?? "—"}</div>
                          </div>
                        );
                      })}
                      {(detail?.participants ?? []).length === 0 ? <div className="text-hud-muted">Keine Teilnehmer.</div> : null}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-hud-line/70 bg-black/10 p-4">
                    <div className="text-xs tracking-[0.22em] uppercase text-hud-muted">Bewertung Einsatz</div>
                    <div className="mt-3 flex items-center justify-between">
                      <div className="text-sm text-hud-muted">Ø {avgOp}/5</div>
                      <div className="text-xs text-hud-muted">{(detail?.ratings ?? []).length} Stimmen</div>
                    </div>

                    <div className="mt-3">
                      <Stars value={opStars} onChange={discordId && viewerMayRate ? setOpStars : undefined} />
                      <textarea
                        className="hud-input mt-3 min-h-[90px]"
                        placeholder={
                          !discordId
                            ? "Login nötig zum Bewerten"
                            : viewerMayRate
                              ? "Kommentar (optional)"
                              : "Nur Teilnehmer können bewerten"
                        }
                        value={opComment}
                        onChange={(e) => setOpComment(e.target.value)}
                        disabled={!discordId || !viewerMayRate}
                      />
                      <button
                        className="btn btn-accent mt-3"
                        onClick={rateOperation}
                        disabled={!discordId || !viewerMayRate || busy || opStars <= 0}
                      >
                        Bewerten
                      </button>
                    </div>
                  </div>
                </div>

                <div className="mt-6 rounded-2xl border border-hud-line/70 bg-black/10 p-4">
                  <div className="text-xs tracking-[0.22em] uppercase text-hud-muted">Soldatenbewertung (im Einsatz)</div>
                  {!viewerMayRate ? (
                    <div className="mt-2 text-sm text-hud-muted">Nur Teilnehmer (oder der Ersteller) können Soldaten aus diesem Einsatz bewerten.</div>
                  ) : null}
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    {(detail?.participants ?? []).map((p) => {
                      const m = rosterById.get(p.marine_card_id);
                      const existing = (detail?.marineRatings ?? []).find((x: any) => {
                        const rater = String((x as any)?.rater_discord_id ?? (x as any)?.discord_id ?? "").trim();
                        return x.marine_card_id === p.marine_card_id && rater && rater === String(discordId ?? "").trim();
                      });
                      const v = Number(existing?.stars ?? 0);
                      const existingComment = String((existing as any)?.comment ?? "").trim();
                      return (
                        <div key={p.marine_card_id} className="rounded-xl border border-hud-line/60 bg-black/10 p-3">
                          <div className="font-medium">{m ? `${m.rank} • ${m.name}` : p.marine_card_id}</div>
                          <div className="mt-2 flex items-center justify-between gap-2">
                            <Stars
                              value={v}
                              onChange={
                                discordId && viewerMayRate
                                  ? () => {
                                      const label = m ? `${m.rank} • ${m.name}` : p.marine_card_id;
                                      setRateModal({
                                        open: true,
                                        marine_card_id: p.marine_card_id,
                                        marine_label: label,
                                        stars: v || 0,
                                        comment: "",
                                      });
                                    }
                                  : undefined
                              }
                            />
                            <div className="text-xs text-hud-muted">
                              {!discordId ? "Login nötig" : viewerMayRate ? "klick zum bewerten" : "Nur Teilnehmer"}
                            </div>
                          </div>
                          {existingComment ? (
                            <div className="mt-2 rounded-lg border border-hud-line/50 bg-black/10 p-2 text-xs text-hud-muted whitespace-pre-wrap">
                              <span className="text-hud-text/80">Grund:</span> {existingComment}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                    {(detail?.participants ?? []).length === 0 ? <div className="text-hud-muted">Keine Teilnehmer.</div> : null}
                  </div>
                </div>

                <div className="mt-6 grid gap-6 lg:grid-cols-2">
                  <div className="rounded-2xl border border-hud-line/70 bg-black/10 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xs tracking-[0.22em] uppercase text-hud-muted">Galaxie-Karte (Immersion)</div>
                        <div className="mt-2 text-sm text-hud-muted">
                          Koordinate: <span className="text-hud-text">{String(selected.map_grid ?? "—")}</span>
                        </div>
                      </div>
                      <a
                        className="btn btn-ghost"
                        href="https://www.starwars.com/star-wars-galaxy-map"
                        target="_blank"
                        rel="noreferrer"
                        title="StarWars.com Galaxy Map öffnen"
                      >
                        Map öffnen
                      </a>
                    </div>

                    {canEdit ? (
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <input
                          className="hud-input !h-9 !py-0 !text-sm"
                          placeholder='z.B. "M-10"'
                          defaultValue={String(selected.map_grid ?? "")}
                          onBlur={(e) => {
                            const v = String(e.target.value ?? "").trim();
                            if (v === String(selected.map_grid ?? "").trim()) return;
                            if (!v) return setOpMapGrid("");
                            setOpMapGrid(v);
                          }}
                          disabled={busy}
                        />
                        <div className="text-xs text-hud-muted">Speichern: Feld verlassen</div>
                      </div>
                    ) : null}

                    <div className="mt-4">
                      {(() => {
                        const pos = gridToPercent(selected.map_grid);
                        return (
                          <div className="relative overflow-hidden rounded-2xl border border-hud-line/60 bg-black/30">
                            {/* Canon Galaxy Map (user provided). Remote hosted on Imgur. */}
                            <img
                              src={mapImgSrc}
                              alt="Star Wars Galaxy Map (canon)"
                              className="h-[280px] w-full object-cover opacity-90"
                              loading="lazy"
                              onError={() => {
                                // one-shot fallback
                                if (mapImgSrc.endsWith(".jpg")) setMapImgSrc("https://i.imgur.com/zGYMR82.png");
                              }}
                            />
                            {/* grid overlay */}
                            <div className="pointer-events-none absolute inset-0 opacity-25" style={{
                              backgroundImage:
                                "linear-gradient(to right, rgba(255,255,255,0.18) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.18) 1px, transparent 1px)",
                              backgroundSize: "calc(100% / 20) calc(100% / 20)",
                            }} />
                            {pos ? (
                              <div
                                className="absolute"
                                style={{ left: `${pos.x}%`, top: `${pos.y}%`, transform: "translate(-50%, -50%)" }}
                              >
                                <div className="h-3 w-3 rounded-full bg-marine-300 shadow" />
                                <div className="mt-1 whitespace-nowrap text-xs text-marine-200">{selected.planet}</div>
                              </div>
                            ) : (
                              <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-hud-muted">
                                Keine Koordinate gesetzt (FE kann z.B. M-10 eintragen).
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-hud-line/70 bg-black/10 p-4">
                    <div className="text-xs tracking-[0.22em] uppercase text-hud-muted">Killlog (Spaß & Statistik)</div>
                    <div className="mt-2 text-sm text-hud-muted">
                      Jeder kann Einträge sehen. Eingeben geht mit Discord-Login.
                    </div>

                    <div className="mt-3 grid gap-2 sm:grid-cols-[140px_1fr_auto]">
                      <input
                        className="hud-input"
                        type="number"
                        min={1}
                        max={99}
                        value={killDeaths}
                        onChange={(e) => setKillDeaths(Number(e.target.value))}
                        disabled={!discordId || busy}
                        placeholder="Tode"
                      />
                      <textarea
                        className="hud-input min-h-[44px]"
                        value={killText}
                        onChange={(e) => setKillText(e.target.value)}
                        disabled={!discordId || busy}
                        placeholder={!discordId ? "Login nötig" : "Hier kannst du Logs reinkopieren – auch mehrere Zeilen.\nz.B. Esk killed Calm using weapon_swrp_fusioncutter"}
                      />
                      <button
                        className="btn btn-accent"
                        type="button"
                        onClick={submitKilllog}
                        disabled={!discordId || busy || !killText.trim()}
                      >
                        Eintragen
                      </button>
                    </div>

                    <div className="mt-4">
                      <div className="text-sm text-hud-muted">Tode insgesamt</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {killAgg.slice(0, 8).map((x) => (
                          <span key={x.name} className="rounded-full border border-hud-line/60 bg-black/20 px-3 py-1 text-xs">
                            {x.name}: <span className="text-hud-text">{x.deaths}</span>
                          </span>
                        ))}
                        {killAgg.length === 0 ? <span className="text-xs text-hud-muted">Noch keine Einträge.</span> : null}
                      </div>
                    </div>

                    <div className="mt-4 max-h-[260px] space-y-2 overflow-auto pr-1">
                      {(detail?.killlogs ?? []).map((r: any) => (
                        <div key={String(r.id ?? `${r.created_at}-${r.discord_id}`)} className="rounded-xl border border-hud-line/60 bg-black/10 p-3">
                          {(() => {
                            const t = String(r.text ?? "");
                            const m = t.match(/^(.+?)\s+killed\s+(.+?)\s+using\s+(.+?)\s*$/i);
                            if (!m) return null;
                            const killer = String(m[1]).trim();
                            const victim = String(m[2]).trim();
                            const weapon = String(m[3]).trim();
                            return (
                              <div className="mb-2 text-xs text-hud-muted">
                                <span className="text-hud-text/90">{killer}</span> → <span className="text-hud-text/90">{victim}</span>
                                <span className="ml-2">({weapon})</span>
                              </div>
                            );
                          })()}
                          <div className="flex items-start justify-between gap-3">
                            <div className="font-medium">
                              {String(r.display_name ?? r.marine_card_id ?? "Unbekannt")}
                              <span className="ml-2 text-xs text-hud-muted">+{Number(r.deaths ?? 0)}</span>
                            </div>
                            <div className="text-xs text-hud-muted">{r.created_at ? fmtDT(String(r.created_at)) : ""}</div>
                          </div>
                          <div className="mt-2 text-sm text-hud-text/90">{String(r.text ?? "")}</div>
                        </div>
                      ))}
                      {(detail?.killlogs ?? []).length === 0 ? <div className="text-hud-muted">Noch keine Killlogs.</div> : null}
                    </div>
                  </div>
                </div>

                <div className="mt-6 rounded-2xl border border-hud-line/70 bg-black/10 p-4">
                  <div className="text-xs tracking-[0.22em] uppercase text-hud-muted">Berichte</div>
                  <div className="mt-3 grid gap-3">
                    <input
                      className="hud-input"
                      placeholder={discordId ? "Bericht-Titel" : "Login nötig"}
                      value={repTitle}
                      onChange={(e) => setRepTitle(e.target.value)}
                      disabled={!discordId}
                    />
                    <textarea
                      className="hud-input min-h-[140px]"
                      placeholder={discordId ? "Bericht (Markdown/Text)" : "Login nötig"}
                      value={repBody}
                      onChange={(e) => setRepBody(e.target.value)}
                      disabled={!discordId}
                    />
                    <button className="btn btn-accent" onClick={addReport} disabled={!discordId || busy || !repTitle || !repBody}>
                      Bericht speichern
                    </button>
                  </div>

                  <div className="mt-5 space-y-2">
                    {(detail?.reports ?? []).map((r) => (
                      <div key={r.id} className="rounded-xl border border-hud-line/60 bg-black/10 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-medium">{r.title}</div>
                            <div className="text-xs text-hud-muted">{fmtDT(r.created_at)}</div>
                          </div>
                        </div>
                        <div className="mt-2 whitespace-pre-wrap text-sm text-hud-text/90">{r.content_md}</div>
                      </div>
                    ))}
                    {(detail?.reports ?? []).length === 0 ? <div className="text-hud-muted">Noch keine Berichte.</div> : null}
                  </div>
                </div>

                {!discordId ? (
                  <div className="mt-6 rounded-xl border border-hud-line/70 bg-black/10 p-4 text-sm text-hud-muted">
                    Du bist nicht eingeloggt. Du kannst alle Einsätze ansehen – aber bewerten und Berichte schreiben geht nur mit Discord-Login.
                  </div>
                ) : null}

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
      ) : (
        <div className="rounded-2xl border border-hud-line/70 bg-black/20 p-5">
          {!(isAdmin || isFE) ? (
            <div className="text-hud-muted">Nur FE oder Einheitsleitung können die zentrale Bewertungsübersicht sehen.</div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs tracking-[0.22em] uppercase text-hud-muted">Soldatenbewertungen</div>
                  <h3 className="mt-2 text-2xl font-semibold">Durchschnitt & Historie</h3>
                  <div className="mt-1 text-sm text-hud-muted">
                    Durchschnitt je Soldat über alle Einsätze + wer wem welche Bewertung gegeben hat.
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    setErr(null);
                    setRatingsBusy(true);
                    loadRatingsAll()
                      .catch((e: any) => setErr(String(e?.message ?? e)))
                      .finally(() => setRatingsBusy(false));
                  }}
                  disabled={ratingsBusy}
                >
                  Refresh
                </button>
              </div>

              {ratingsBusy ? <div className="mt-4 text-hud-muted">Lade…</div> : null}

              {err ? (
                <div className="mt-4 rounded-xl border border-red-500/40 bg-red-950/20 p-4 text-sm">
                  <div className="font-medium text-red-200">Fehler</div>
                  <div className="mt-1 text-hud-muted whitespace-pre-wrap">{err}</div>
                </div>
              ) : null}

              <div className="mt-6 grid gap-6 lg:grid-cols-2">
                <div className="rounded-2xl border border-hud-line/70 bg-black/10 p-4">
                  <div className="flex items-center justify-between">
                    <div className="text-xs tracking-[0.22em] uppercase text-hud-muted">Durchschnitt</div>
                    <div className="text-xs text-hud-muted">{avgByMarine.length} Soldaten</div>
                  </div>

                  <div className="mt-3 space-y-2">
                    {avgByMarine.map((r) => (
                      <div key={r.name} className="rounded-xl border border-hud-line/60 bg-black/10 p-3">
                        <div className="font-medium">{r.name}</div>
                        <div className="mt-1 text-sm text-hud-muted">
                          Ø {r.avg}/5 • {r.count} Bewertungen
                        </div>
                      </div>
                    ))}
                    {avgByMarine.length === 0 ? <div className="text-hud-muted">Keine Bewertungen vorhanden.</div> : null}
                  </div>
                </div>

                <div className="rounded-2xl border border-hud-line/70 bg-black/10 p-4">
                  <div className="flex items-center justify-between">
                    <div className="text-xs tracking-[0.22em] uppercase text-hud-muted">Historie</div>
                    <div className="text-xs text-hud-muted">{ratingsAll.length} Einträge</div>
                  </div>

                  <div className="mt-3 space-y-2 max-h-[520px] overflow-auto pr-2">
                    {ratingsAll.map((r, idx) => (
                      <div key={idx} className="rounded-xl border border-hud-line/60 bg-black/10 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-medium">{String(r?.marine_name ?? "Unbekannt")}</div>
                            <div className="mt-1 text-sm text-hud-muted">
                              {Number(r?.score ?? 0)}/5 • von {String(r?.rater_name ?? "Unbekannt")}
                            </div>
                            <div className="mt-1 text-xs text-hud-muted">
                              Einsatz: {String(r?.operation_title ?? r?.operation_id ?? "—")}
                            </div>
                            {String((r as any)?.comment ?? "").trim() ? (
                              <div className="mt-2 rounded-lg border border-hud-line/50 bg-black/10 p-2 text-xs text-hud-muted whitespace-pre-wrap">
                                <span className="text-hud-text/80">Grund:</span> {String((r as any)?.comment ?? "").trim()}
                              </div>
                            ) : null}
                          </div>
                          <div className="text-xs text-hud-muted">{r?.created_at ? fmtDT(String(r.created_at)) : ""}</div>
                        </div>
                      </div>
                    ))}
                    {ratingsAll.length === 0 ? <div className="text-hud-muted">Noch keine Einträge.</div> : null}
                  </div>
                </div>
              </div>

              {!discordId ? (
                <div className="mt-6 rounded-xl border border-hud-line/70 bg-black/10 p-4 text-sm text-hud-muted">
                  Hinweis: Bewertungen können nur mit Discord-Login abgegeben werden. (Das ist serverseitig abgesichert.)
                </div>
              ) : null}
            </>
          )}
        </div>
      )}


    </div>
  );
}