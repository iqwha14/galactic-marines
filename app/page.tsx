"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

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
  const [isEditor, setIsEditor] = useState(false);
  const [roleLoaded, setRoleLoaded] = useState(false);

  // Session sicher clientseitig laden (kein SSR Crash)
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/auth/session", {
          credentials: "include",
        });
        const json = await res.json().catch(() => null);
        if (alive) {
          setIsEditor(!!json?.user?.isEditor);
          setRoleLoaded(true);
        }
      } catch {
        if (alive) setRoleLoaded(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Mouse Glow
  const glowRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const x = (e.clientX / window.innerWidth) * 100;
      const y = (e.clientY / window.innerHeight) * 100;
      glowRef.current?.style.setProperty("--mx", `${x}%`);
      glowRef.current?.style.setProperty("--my", `${y}%`);
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  // Starfield
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
      s: 0.5 + Math.random() * 1.5,
      v: 0.2 + Math.random() * 0.6,
    }));

    const resize = () => {
      w = canvas.width = window.innerWidth * devicePixelRatio;
      h = canvas.height = window.innerHeight * devicePixelRatio;
    };
    resize();
    window.addEventListener("resize", resize);

    const tick = () => {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "rgba(255,255,255,0.8)";
      for (const st of stars) {
        st.y += st.v / 1000;
        if (st.y > 1) st.y = 0;
        const px = st.x * w;
        const py = st.y * h;
        const r = st.s * devicePixelRatio;
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  const tiles: Tile[] = useMemo(() => {
    const base: Tile[] = [
      {
        title: "Mitgliederverwaltung",
        subtitle: "PERSONNEL / ROSTER",
        lines: ["Soldaten", "Roster", "Beförderungen", "Fortbildungen"],
        href: "/members",
        accent: "border-cyan-500",
        tag: "ACCESS: STANDARD",
      },
      {
        title: "Dokumente",
        subtitle: "ARCHIVE",
        lines: ["Einheitsdokumente", "UO Dokumente", "Führungsebene"],
        href: "/documents",
        accent: "border-purple-500",
        tag: "ACCESS: STANDARD",
      },
      {
        title: "Einsatzzentrale",
        subtitle: "OPS COMMAND",
        lines: ["Operationen", "Reports", "Bewertungen", "Archiv"],
        href: "/ops",
        accent: "border-emerald-500",
        tag: "ACCESS: STANDARD",
      },
    ];

    base.push({
      title: "Verwaltung",
      subtitle: "ADMIN CONTROL",
      lines: ["Logs", "Rollenverwaltung", "Audit-Trail", "Datenexport"],
      href: "/admin",
      accent: "border-amber-500",
      tag: isEditor ? "ACCESS: EDITOR" : "ADMIN LOCK",
      locked: !isEditor,
    });

    return base;
  }, [isEditor]);

  return (
    <main className="relative min-h-screen bg-black text-white overflow-hidden">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      <div ref={glowRef} className="absolute inset-0 pointer-events-none" />

      <div className="relative z-10 max-w-6xl mx-auto px-6 py-16">
        <h1 className="text-5xl font-bold mb-4 tracking-widest bg-gradient-to-r from-cyan-400 to-purple-500 bg-clip-text text-transparent">
          GALACTIC MARINES
        </h1>
        <p className="text-gray-400 mb-12">
          Command Interface – Zugriff auf operative Systeme
        </p>

        <div className="grid md:grid-cols-2 gap-8">
          {tiles.map((t) => {
            const card = (
              <div
                className={`relative p-8 rounded-2xl border ${t.accent} bg-white/5 backdrop-blur-xl transition hover:scale-105`}
              >
                <h2 className="text-2xl font-semibold mb-2">{t.title}</h2>
                <p className="text-sm text-gray-400 mb-4">{t.subtitle}</p>
                <ul className="text-sm text-gray-300 space-y-1">
                  {t.lines.map((l) => (
                    <li key={l}>• {l}</li>
                  ))}
                </ul>
                <div className="mt-6 text-xs text-gray-500">{t.tag}</div>

                {t.locked && (
                  <div className="absolute inset-0 bg-black/70 flex items-center justify-center rounded-2xl">
                    <div className="text-center">
                      <div className="text-red-400 font-bold">
                        ZUGRIFF GESPERRT
                      </div>
                      <div className="text-xs text-gray-400 mt-1">
                        Nur Editors
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );

            if (t.locked) {
              return (
                <div key={t.title} className="cursor-not-allowed">
                  {card}
                </div>
              );
            }

            return (
              <Link key={t.title} href={t.href}>
                {card}
              </Link>
            );
          })}
        </div>

        <footer className="mt-12 text-sm text-gray-500">
          STATUS: ONLINE {roleLoaded ? "" : "• SYNC…"}
        </footer>
      </div>
    </main>
  );
}