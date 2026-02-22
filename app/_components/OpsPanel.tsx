"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";

type Operation = {
  id: string;
  title: string;
  created_at?: string;
};

type RatingRow = {
  marine_name: string | null;
  rater_name: string | null;
  score: number | null;
  operation: string | null;
};

export default function OpsPanel() {
  const { data: session, status } = useSession();

  const isAdmin = !!(session as any)?.isAdmin;
  const isFE = !!(session as any)?.canSeeFE;
  const isLoggedIn = status === "authenticated";

  const [ops, setOps] = useState<Operation[]>([]);
  const [ratings, setRatings] = useState<RatingRow[]>([]);
  const [loadingOps, setLoadingOps] = useState(true);
  const [loadingRatings, setLoadingRatings] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* -------------------------------------------------- */
  /* Load Operations                                    */
  /* -------------------------------------------------- */
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoadingOps(true);
        const res = await fetch("/api/ops", { cache: "no-store" });
        const text = await res.text();

        let json: any = null;
        try {
          json = JSON.parse(text);
        } catch {}

        if (!res.ok) {
          throw new Error(
            json?.error ||
              json?.details ||
              text ||
              `Ops request failed (${res.status})`
          );
        }

        if (!alive) return;

        setOps(Array.isArray(json?.rows) ? json.rows : []);
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message ?? "Fehler beim Laden der Einsätze");
      } finally {
        if (alive) setLoadingOps(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  /* -------------------------------------------------- */
  /* Load Ratings (nur FE / Einheitsleitung)           */
  /* -------------------------------------------------- */
  useEffect(() => {
    if (!(isAdmin || isFE)) return;

    let alive = true;

    (async () => {
      try {
        setLoadingRatings(true);
        const res = await fetch("/api/ratings/marines", {
          cache: "no-store",
        });

        const text = await res.text();

        let json: any = null;
        try {
          json = JSON.parse(text);
        } catch {}

        if (!res.ok) {
          throw new Error(
            json?.error ||
              json?.details ||
              text ||
              `Ratings request failed (${res.status})`
          );
        }

        if (!alive) return;

        setRatings(Array.isArray(json?.rows) ? json.rows : []);
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message ?? "Fehler beim Laden der Bewertungen");
      } finally {
        if (alive) setLoadingRatings(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [isAdmin, isFE]);

  /* -------------------------------------------------- */
  /* Durchschnitt pro Soldat berechnen                  */
  /* -------------------------------------------------- */
  const averages = useMemo(() => {
    const map = new Map<
      string,
      { total: number; count: number }
    >();

    for (const r of ratings) {
      const name = String(r.marine_name ?? "Unbekannt");
      const score = Number(r.score ?? 0);

      if (!map.has(name)) {
        map.set(name, { total: 0, count: 0 });
      }

      const entry = map.get(name)!;
      entry.total += score;
      entry.count += 1;
    }

    return Array.from(map.entries()).map(([name, data]) => ({
      name,
      avg: data.count ? (data.total / data.count).toFixed(2) : "0.00",
      count: data.count,
    }));
  }, [ratings]);

  /* -------------------------------------------------- */
  /* Render                                              */
  /* -------------------------------------------------- */
  return (
    <div className="space-y-8">

      {/* -------------------------------------------------- */}
      {/* Einsätze                                           */}
      {/* -------------------------------------------------- */}
      <div className="rounded-2xl border border-white/10 p-6">
        <h2 className="text-lg font-semibold mb-4">
          Einsätze
        </h2>

        {loadingOps && (
          <p className="text-sm text-white/60">
            Lade Einsätze…
          </p>
        )}

        {!loadingOps && ops.length === 0 && (
          <p className="text-sm text-white/60">
            Keine Einsätze vorhanden.
          </p>
        )}

        <div className="space-y-3">
          {ops.map((op) => (
            <div
              key={String(op.id)}
              className="rounded-xl border border-white/10 p-4"
            >
              <div className="font-medium">
                {String(op.title ?? "Unbenannter Einsatz")}
              </div>
              <div className="text-xs text-white/50 mt-1">
                {op.created_at
                  ? new Date(op.created_at).toLocaleString("de-DE")
                  : ""}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* -------------------------------------------------- */}
      {/* Soldatenbewertungen (nur FE / Einheitsleitung)    */}
      {/* -------------------------------------------------- */}
      {(isAdmin || isFE) && (
        <div className="rounded-2xl border border-white/10 p-6">
          <h2 className="text-lg font-semibold mb-6">
            Soldatenbewertungen
          </h2>

          {loadingRatings && (
            <p className="text-sm text-white/60">
              Lade Bewertungen…
            </p>
          )}

          {!loadingRatings && ratings.length === 0 && (
            <p className="text-sm text-white/60">
              Keine Bewertungen vorhanden.
            </p>
          )}

          {/* Durchschnitt pro Soldat */}
          <div className="mb-8">
            <h3 className="text-sm font-semibold mb-3 text-white/70">
              Durchschnitt je Soldat
            </h3>

            <div className="space-y-2">
              {averages.map((a) => (
                <div
                  key={a.name}
                  className="rounded-xl border border-white/10 p-3"
                >
                  <div className="font-medium">
                    {a.name}
                  </div>
                  <div className="text-sm text-white/60">
                    Ø {a.avg} ★ ({a.count} Bewertungen)
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Einzelbewertungen */}
          <div>
            <h3 className="text-sm font-semibold mb-3 text-white/70">
              Einzelbewertungen
            </h3>

            <div className="space-y-3">
              {ratings.map((r, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-white/10 p-4"
                >
                  <div className="font-medium">
                    {String(r.marine_name ?? "Unbekannt")}
                  </div>

                  <div className="text-sm text-white/60 mt-1">
                    Bewertung: {Number(r.score ?? 0)} ★
                  </div>

                  <div className="text-xs text-white/50 mt-1">
                    Von: {String(r.rater_name ?? "Unbekannt")}
                    {" | Einsatz: "}
                    {String(r.operation ?? "—")}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* -------------------------------------------------- */}
      {/* Fehleranzeige                                      */}
      {/* -------------------------------------------------- */}
      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm">
          <div className="font-medium">Fehler</div>
          <div className="mt-1 text-white/70">
            {String(error)}
          </div>
        </div>
      )}
    </div>
  );
}