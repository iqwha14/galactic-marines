"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { signIn, signOut } from "next-auth/react";

type SessionShape = {
  user?: { name?: string | null; image?: string | null };
  discordId?: string | null;
  isAdmin?: boolean;
  canSeeFE?: boolean;
  canSeeUO?: boolean;
};

type Tile = {
  title: string;
  subtitle: string;
  lines: string[];
  href: string;
  tag: string;
  locked?: boolean;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function roleLabel(sess: SessionShape | null): string {
  if (!sess) return "Standard";
  if (sess.isAdmin) return "Einheitsleitung";
  if (sess.canSeeFE) return "FE";
  if (sess.canSeeUO) return "UO";
  return "Standard";
}

export default function CommandDeck() {
  const [sess, setSess] = useState<SessionShape | null>(null);
  const [roleLoaded, setRoleLoaded] = useState(false);

  const isSignedIn = !!sess?.user;

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/auth/session", { credentials: "include" });
        const json = (await res.json().catch(() => null)) as any;
        if (alive) {
          setSess(json);
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

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let w = 0;
    let h = 0;

    const stars = Array.from({ length: 190 }, () => ({
      x: Math.random(),
      y: Math.random(),
      z: Math.random(),
      s: 0.4 + Math.random() * 1.5,
      v: 0.14 + Math.random() * 0.6,
    }));

    const resize = () => {
      w = canvas.width = Math.floor(window.innerWidth * devicePixelRatio);
      h = canvas.height = Math.floor(window.innerHeight * devicePixelRatio);
    };
    resize();
    window.addEventListener("resize", resize);

    const tick = () => {
      ctx.clearRect(0, 0, w, h);

      const g = ctx.createRadialGradient(w * 0.52, h * 0.42, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.65);
      g.addColorStop(0, "rgba(215,40,70,0.07)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      ctx.fillStyle = "rgba(255,255,255,0.7)";
      for (const st of stars) {
        st.y += (st.v / 900) * (h / devicePixelRatio);
        if (st.y > 1) {
          st.y = 0;
          st.x = Math.random();
          st.z = Math.random();
          st.s = 0.4 + Math.random() * 1.5;
          st.v = 0.14 + Math.random() * 0.6;
        }
        const px = st.x * w;
        const py = st.y * h;
        const r = st.s * (0.6 + st.z) * devicePixelRatio;
        ctx.globalAlpha = clamp(0.2 + st.z * 0.8, 0.2, 1);
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
    const base: Tile[] = [
      {
        title: "Mitgliederverwaltung",
        subtitle: "SOLDATEN / MARINES",
        lines: ["Soldaten", "Abmeldungen", "Adjutanten", "Fortbildungen"],
        href: "/members",
        tag: "ACCESS: STANDARD",
      },
      {
        title: "Dokumente",
        subtitle: "ARCHIVE / DOCTRINE",
        lines: ["Einheitsdokumente", "UO Dokument", "FE Dokument"],
        href: "/documents",
        tag: "ACCESS: STANDARD",
      },
      {
        title: "Einsatzzentrale",
        subtitle: "OPS / COMMAND",
        lines: ["Einsätze"],
        href: "/ops",
        tag: "ACCESS: STANDARD",
      },
    ];

    const locked = !sess?.isAdmin;
    base.push({
      title: "Verwaltung",
      subtitle: "UNIT CONTROL",
      lines: ["Logs", "Rollen & Rechte", "Audit-Trail", "Datenexport", "Feature Toggles", "Notfallmodus"],
      href: "/admin",
      tag: locked ? "ACCESS: DENIED" : "ACCESS: EINHEITSLEITUNG",
      locked,
    });

    return base;
  }, [sess?.isAdmin]);

  return (
    <main className="gm-bg relative min-h-screen overflow-hidden text-white">
      <canvas ref={canvasRef} className="gm-stars absolute inset-0 h-full w-full" />
      <div ref={glowRef} className="gm-glow absolute inset-0" />
      <div className="gm-scanlines absolute inset-0 pointer-events-none" />
      <div className="gm-grid absolute inset-0 pointer-events-none" />

      <div className="relative z-10 mx-auto max-w-6xl px-6 py-14">
        <header className="mb-10 flex flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="gm-kicker">GALACTIC MARINES</div>
              <h1 className="gm-title">
                MARINE <span className="gm-title-accent">COMMAND DECK</span>
              </h1>
              <p className="gm-subtitle">Zugriff auf operative Systeme. Wähle ein Modul.</p>
            </div>

            <div className="flex items-center gap-3">
              {isSignedIn ? (
                <>
                  <div className="gm-chip">
                    <div className="text-xs text-white/70">SIGNED IN</div>
                    <div className="text-sm font-medium">{sess?.user?.name || sess?.discordId || "Discord"}</div>
                    <div className="text-xs text-white/60">{roleLabel(sess)}</div>
                  </div>
                  <button type="button" className="gm-btn gm-btn-ghost" onClick={() => signOut({ callbackUrl: "/" })}>
                    Logout
                  </button>
                </>
              ) : (
                <button type="button" className="gm-btn gm-btn-primary" onClick={() => signIn("discord", { callbackUrl: "/" })}>
                  Discord Login
                </button>
              )}
            </div>
          </div>

          <div className="gm-statusbar">
            <span>
              STATUS: <span className="gm-ok">ONLINE</span>
              {!roleLoaded && <span className="ml-3 text-white/55">SYNC…</span>}
            </span>
            <span className="text-white/55">SECURE CHANNEL • REPUBLIC COMLINK</span>
          </div>
        </header>

        <section className="grid gap-10 md:grid-cols-2">
          {tiles.map((t) => {
            const Card = (
              <div className="gm-tile group">
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
                      <div className="gm-lock-text">Nur Einheitsleitung kann dieses Modul öffnen.</div>
                      <div className="gm-lock-chip">AUTH REQUIRED</div>
                    </div>
                  </div>
                )}
              </div>
            );

            if (t.locked) return <div key={t.title} className="cursor-not-allowed">{Card}</div>;
            return (
              <Link key={t.title} href={t.href} className="block">
                {Card}
              </Link>
            );
          })}
        </section>
      </div>
    </main>
  );
}
