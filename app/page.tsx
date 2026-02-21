"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef } from "react";
import { useSession } from "next-auth/react";

type Tile = {
  title: string;
  subtitle: string;
  lines: string[];
  href: string;
  accent: string;
  tag: string;
  locked?: boolean;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export default function Home() {
  const { data: session } = useSession();
  const isEditor = (session?.user as any)?.isEditor === true;

  // mouse-follow holo glow
  const glowRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const x = (e.clientX / window.innerWidth) * 100;
      const y = (e.clientY / window.innerHeight) * 100;
      if (glowRef.current) {
        glowRef.current.style.setProperty("--mx", `${x}%`);
        glowRef.current.style.setProperty("--my", `${y}%`);
      }
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  // starfield (lightweight canvas)
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let w = 0;
    let h = 0;

    const stars = Array.from({ length: 180 }, () => ({
      x: Math.random(),
      y: Math.random(),
      z: Math.random(),
      s: 0.4 + Math.random() * 1.6,
      v: 0.15 + Math.random() * 0.55,
    }));

    const resize = () => {
      w = canvas.width = Math.floor(window.innerWidth * devicePixelRatio);
      h = canvas.height = Math.floor(window.innerHeight * devicePixelRatio);
    };
    resize();
    window.addEventListener("resize", resize);

    const tick = () => {
      ctx.clearRect(0, 0, w, h);

      // subtle vignette
      const g = ctx.createRadialGradient(w * 0.5, h * 0.45, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.65);
      g.addColorStop(0, "rgba(0,255,255,0.06)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      // stars
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      for (const st of stars) {
        st.y += (st.v / 800) * (h / devicePixelRatio);
        if (st.y > 1) {
          st.y = 0;
          st.x = Math.random();
          st.z = Math.random();
          st.s = 0.4 + Math.random() * 1.6;
          st.v = 0.15 + Math.random() * 0.55;
        }
        const px = st.x * w;
        const py = st.y * h;
        const r = st.s * (0.6 + st.z) * devicePixelRatio;
        ctx.globalAlpha = clamp(0.15 + st.z * 0.85, 0.15, 1);
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  const tiles: Tile[] = useMemo(() => {
    const baseTiles: Tile[] = [
      {
        title: "Mitgliederverwaltung",
        subtitle: "PERSONNEL / ROSTER",
        lines: ["Soldaten & Profile", "Roster & Adjutanten", "Beförderungen", "Fortbildungen"],
        href: "/members",
        accent: "tile-accent-cyan",
        tag: "ACCESS: STANDARD",
      },
      {
        title: "Dokumente",
        subtitle: "ARCHIVE / DOCTRINE",
        lines: ["Einheitsdokumente (alle)", "Unteroffiziersdokumente", "Führungsebene (FE-ID)"],
        href: "/documents",
        accent: "tile-accent-violet",
        tag: "ACCESS: STANDARD",
      },
      {
        title: "Einsatzzentrale",
        subtitle: "OPS / COMMAND",
        lines: ["Einsätze anlegen & verwalten", "Reports & Lagebilder", "Bewertungen", "Archiv"],
        href: "/ops",
        accent: "tile-accent-emerald",
        tag: "ACCESS: STANDARD",
      },
    ];

    // always show admin tile for the wow moment (locked overlay for non-editors)
    baseTiles.push({
      title: "Verwaltung",
      subtitle: "ADMIN / CONTROL",
      lines: ["System Logs", "Rollenverwaltung", "Audit-Trail", "Datenexport", "Feature Toggles", "Notfallmodus"],
      href: "/admin",
      accent: "tile-accent-amber",
      tag: isEditor ? "ACCESS: EDITOR" : "ADMIN LOCK",
      locked: !isEditor,
    });

    return baseTiles;
  }, [isEditor]);

  return (
    <main className="gm-bg relative min-h-screen overflow-hidden text-white">
      {/* starfield */}
      <canvas ref={canvasRef} className="gm-stars absolute inset-0 h-full w-full" />

      {/* holo glow */}
      <div ref={glowRef} className="gm-glow absolute inset-0" />

      {/* scanlines + grid */}
      <div className="gm-scanlines absolute inset-0 pointer-events-none" />
      <div className="gm-grid absolute inset-0 pointer-events-none" />

      <div className="relative z-10 mx-auto max-w-6xl px-6 py-16">
        <header className="mb-12">
          <div className="gm-kicker">COMMAND INTERFACE</div>
          <h1 className="gm-title">
            GALACTIC <span className="gm-title-accent">MARINES</span>
          </h1>
          <p className="gm-subtitle">
            Zugriff auf operative Systeme. Wähle ein Modul, um fortzufahren.
          </p>
        </header>

        <section className="grid gap-10 md:grid-cols-2">
          {tiles.map((t) => {
            const Card = (
              <div className={`gm-tile group ${t.accent}`}>
                <div className="gm-tile-frame" />
                <div className="gm-tile-sweep" />
                <div className="gm-tile-content">
                  <div className="gm-tile-top">
                    <div>
                      <div className="gm-tile-sub">{t.subtitle}</div>
                      <div className="gm-tile-title">{t.title}</div>
                    </div>
                    <div className="gm-tag">{t.tag}</div>
                  </div>

                  <ul className="gm-lines">
                    {t.lines.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>

                  <div className="gm-cta">
                    <span className="gm-cta-label">OPEN MODULE</span>
                    <span className="gm-cta-arrow">→</span>
                  </div>
                </div>

                {t.locked && (
                  <div className="gm-lock">
                    <div className="gm-lock-inner">
                      <div className="gm-lock-title">ZUGRIFF GESPERRT</div>
                      <div className="gm-lock-text">Nur Editors können dieses Modul öffnen.</div>
                      <div className="gm-lock-chip">AUTH REQUIRED</div>
                    </div>
                  </div>
                )}
              </div>
            );

            if (t.locked) {
              return (
                <div key={t.title} className="cursor-not-allowed opacity-95">
                  {Card}
                </div>
              );
            }

            return (
              <Link key={t.title} href={t.href} className="block">
                {Card}
              </Link>
            );
          })}
        </section>

        <footer className="mt-14 gm-footer">
          <div className="gm-footer-left">
            STATUS: <span className="gm-ok">ONLINE</span>
          </div>
          <div className="gm-footer-right">
            {isEditor ? "ROLE: EDITOR" : "ROLE: STANDARD"} • SECURE CHANNEL • v0.9
          </div>
        </footer>
      </div>
    </main>
  );
}
