"use client";

import Link from "next/link";
import { SessionProvider, useSession } from "next-auth/react";
import { useEffect, useMemo, useRef, useState } from "react";

function CommandDeckHomeInner() {
  const { data: session, status } = useSession();
  const [isEditor, setIsEditor] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setIsEditor((session?.user as any)?.isEditor === true);
  }, [session]);

  // Mouse-follow hologlow (no sound)
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const onMove = (e: MouseEvent) => {
      const r = el.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * 100;
      const y = ((e.clientY - r.top) / r.height) * 100;
      el.style.setProperty("--mx", `${x.toFixed(2)}%`);
      el.style.setProperty("--my", `${y.toFixed(2)}%`);
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  const tiles = useMemo(() => {
    const base = [
      {
        title: "Mitgliederverwaltung",
        subtitle: "Soldaten • Roster • Adjutanten",
        lines: ["Beförderungen", "Fortbildungen", "Ausbildungsstand"],
        href: "/members",
        accent: "tile-accent-cyan",
        tag: "PERSONNEL",
      },
      {
        title: "Dokumente",
        subtitle: "Einheitsdokumente • UO • Führungsebene",
        lines: ["Einheitsdokumente (für alle)", "Unteroffizier", "FE-Dokument"],
        href: "/documents",
        accent: "tile-accent-violet",
        tag: "ARCHIVES",
      },
      {
        title: "Einsatzzentrale",
        subtitle: "Operationen • Reports • Bewertungen",
        lines: ["Einsatz anlegen", "Auswertung", "Einsatzarchiv"],
        href: "/ops",
        accent: "tile-accent-emerald",
        tag: "OPS",
      },
    ];

    if (isEditor) {
      base.push({
        title: "Verwaltung",
        subtitle: "Editor-Zugriff • Systemkontrolle",
        lines: ["Audit-Trail", "Feature-Toggles", "Datenexport"],
        href: "/admin",
        accent: "tile-accent-amber",
        tag: "ADMIN",
      });
    } else {
      // Still show a locked tile for the WOW moment
      base.push({
        title: "Verwaltung",
        subtitle: "Gesperrt • Editor erforderlich",
        lines: ["Logs", "Rollen", "Systemfunktionen"],
        href: "/admin",
        accent: "tile-accent-amber",
        tag: "ADMIN LOCK",
        locked: true,
      });
    }

    return base;
  }, [isEditor]);

  return (
    <main ref={rootRef} className="relative min-h-screen overflow-hidden text-white">
      {/* Layer: starfield + parallax glow */}
      <div className="absolute inset-0 starfield" />
      <div className="absolute inset-0 hud-grid opacity-[0.12]" />
      <div className="absolute inset-0 scanlines pointer-events-none" />
      <div className="absolute inset-0 holo-glow pointer-events-none" />

      {/* Top header */}
      <div className="relative z-10 mx-auto max-w-7xl px-6 py-14">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="inline-flex items-center gap-3 rounded-full border border-hud-line/70 bg-black/30 px-4 py-2 backdrop-blur">
            <span className="h-2 w-2 rounded-full bg-marine-500 shadow-[0_0_20px_rgba(99,102,241,.65)]" />
            <span className="text-xs tracking-[0.28em] uppercase text-hud-muted">GM // Command Deck</span>
            <span className="text-xs text-hud-muted">
              {status === "loading"
                ? "SYNC…"
                : session?.user
                  ? `AUTH // ${(session.user as any)?.name ?? "ONLINE"}`
                  : "GUEST"}
            </span>
          </div>

          <h1 className="glitch-title text-5xl md:text-7xl font-semibold tracking-[0.18em]">
            GALACTIC MARINES
          </h1>
          <p className="max-w-2xl text-sm md:text-base text-hud-muted tracking-wide">
            Zugriff auf Personal, Archive und Operationen. Wähle ein Systemmodul, um fortzufahren.
          </p>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-xs text-hud-muted">
            <span className="rounded-full border border-hud-line/70 bg-black/20 px-3 py-1">SECURITY: ACTIVE</span>
            <span className="rounded-full border border-hud-line/70 bg-black/20 px-3 py-1">SIGNAL: STABLE</span>
            <span className="rounded-full border border-hud-line/70 bg-black/20 px-3 py-1">HUD: ONLINE</span>
          </div>
        </div>

        {/* Tiles */}
        <section className="mt-14 grid gap-7 md:grid-cols-2">
          {tiles.map((t: any) => {
            const content = (
              <div
                className={["tile", t.accent, t.locked ? "tile-locked" : ""].join(" ")}
                style={{ transformStyle: "preserve-3d" }}
              >
                <div className="tile-bg" />
                <div className="tile-border" />

                <div className="relative z-10">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="tile-tag">{t.tag}</div>
                      <h2 className="mt-3 text-2xl md:text-3xl font-semibold tracking-wide">{t.title}</h2>
                      <p className="mt-2 text-sm text-hud-muted">{t.subtitle}</p>
                    </div>
                    <div className="tile-radar" aria-hidden />
                  </div>

                  <div className="mt-6 grid gap-2">
                    {t.lines.map((line: string) => (
                      <div key={line} className="tile-line">
                        <span className="tile-dot" />
                        <span className="text-sm">{line}</span>
                      </div>
                    ))}
                  </div>

                  <div className="mt-8 flex items-center justify-between">
                    <div className="tile-footnote">{t.locked ? "ACCESS: DENIED" : "ACCESS: GRANTED"}</div>
                    <div className="tile-cta">
                      {t.locked ? "AUTH REQUIRED" : "OPEN MODULE"}
                      <span className="tile-cta-arrow" aria-hidden>
                        ↗
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );

            return t.locked ? (
              <div key={t.title} className="opacity-90">
                {content}
              </div>
            ) : (
              <Link key={t.title} href={t.href} className="block">
                {content}
              </Link>
            );
          })}
        </section>

        <footer className="relative z-10 mt-14 text-center text-xs text-hud-muted">
          <span className="opacity-90">Build for Galactic Marines</span>
          <span className="mx-2">•</span>
          <span className="opacity-90">No audio • Maximum vibe</span>
        </footer>
      </div>
    </main>
  );
}

export default function Page() {
  return (
    <SessionProvider>
      <CommandDeckHomeInner />
    </SessionProvider>
  );
}
