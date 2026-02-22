"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

type Rating = {
  marine_name: string;
  rater_name: string;
  score: number;
  operation: string;
};

export default function OpsPanel() {
  const { data: session } = useSession();
  const isAdmin = !!(session as any)?.isAdmin;
  const isFE = !!(session as any)?.canSeeFE;

  const [ratings, setRatings] = useState<Rating[]>([]);
  const [ratingsErr, setRatingsErr] = useState<string | null>(null);

  useEffect(() => {
    if (!(isAdmin || isFE)) return;

    let alive = true;
    (async () => {
      try {
        setRatingsErr(null);
        const res = await fetch("/api/ratings/marines", { cache: "no-store" });
        const text = await res.text();
        let json: any = null;
        try {
          json = JSON.parse(text);
        } catch {
          // ignore
        }
        if (!res.ok) {
          throw new Error(json?.error || json?.details || text || `Request failed (${res.status})`);
        }
        if (!alive) return;
        setRatings(Array.isArray(json?.rows) ? json.rows : []);
      } catch (e: any) {
        if (!alive) return;
        setRatings([]);
        setRatingsErr(e?.message ?? String(e));
      }
    })();

    return () => {
      alive = false;
    };
  }, [isAdmin, isFE]);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-white/10 p-6">
        <h2 className="text-lg font-semibold">Einsätze</h2>
        <p className="text-sm text-white/60 mt-2">
          Einsatzübersicht hier anzeigen (bestehende Logik bleibt unberührt).
        </p>
      </div>

      {(isAdmin || isFE) && (
        <div className="rounded-2xl border border-white/10 p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Soldatenbewertungen</h2>
            <span className="text-xs text-white/50">{ratings.length} Einträge</span>
          </div>

          {ratingsErr ? (
            <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm">
              <div className="font-medium">Fehler beim Laden</div>
              <div className="mt-1 text-white/70">{ratingsErr}</div>
            </div>
          ) : null}

          {ratings.length === 0 && !ratingsErr ? (
            <p className="text-sm text-white/60 mt-4">Keine Bewertungen vorhanden.</p>
          ) : null}

          <div className="mt-4 space-y-3">
            {ratings.map((r, i) => (
              <div key={i} className="rounded-xl border border-white/10 p-4">
                <div className="font-medium">{r.marine_name}</div>
                <div className="text-sm text-white/60 mt-1">Bewertung: {r.score} ★</div>
                <div className="text-xs text-white/50 mt-1">
                  Von: {r.rater_name} | Einsatz: {r.operation}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}