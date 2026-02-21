"use client";

import Link from "next/link";
import { SessionProvider, useSession } from "next-auth/react";
import AppShell from "../_components/AppShell";

function AdminInner() {
  const { data: session, status } = useSession();
  const isEditor = (session?.user as any)?.isEditor === true;

  return (
    <main className="relative min-h-screen overflow-hidden text-white">
      <div className="absolute inset-0 starfield" />
      <div className="absolute inset-0 hud-grid opacity-[0.10]" />
      <div className="absolute inset-0 scanlines pointer-events-none" />

      <div className="relative z-10 mx-auto max-w-7xl px-6 py-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs tracking-[0.28em] uppercase text-hud-muted">GM // ADMIN CONSOLE</div>
            <h1 className="mt-2 text-3xl font-semibold tracking-wide">Verwaltung</h1>
            <p className="mt-2 text-sm text-hud-muted">Systemfunktionen, Audit-Trail und Wartung.</p>
          </div>
          <Link href="/" className="btn btn-ghost">← Command Deck</Link>
        </div>

        {status === "loading" ? (
          <div className="mt-10 rounded-2xl border border-hud-line/70 bg-black/30 p-6 text-hud-muted">SYNC…</div>
        ) : !session?.user ? (
          <div className="mt-10 rounded-2xl border border-hud-line/70 bg-black/30 p-6 text-hud-muted">
            Bitte einloggen, um fortzufahren.
          </div>
        ) : !isEditor ? (
          <div className="mt-10 relative overflow-hidden rounded-2xl border border-red-500/30 bg-black/35 p-8">
            <div className="scanline absolute inset-0" />
            <div className="relative">
              <div className="text-xs tracking-[0.28em] uppercase text-red-200/80">ACCESS DENIED</div>
              <div className="mt-2 text-2xl font-semibold">Editor erforderlich</div>
              <p className="mt-2 text-sm text-hud-muted">
                Du darfst alle Einsätze ansehen – aber Verwaltung, Erstellen, Bearbeiten und Löschen sind nur für Editors.
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                <Link className="btn btn-accent" href="/ops">Zur Einsatzzentrale</Link>
                <Link className="btn btn-ghost" href="/members">Zur Mitgliederverwaltung</Link>
              </div>
            </div>
          </div>
        ) : (
          <>
            <section className="mt-10 grid gap-6 md:grid-cols-2">
              <div className="tile tile-accent-amber">
                <div className="tile-bg" />
                <div className="tile-border" />
                <div className="relative z-10">
                  <div className="tile-tag">AUDIT</div>
                  <h2 className="mt-3 text-2xl font-semibold">Logs / Audit-Trail</h2>
                  <p className="mt-2 text-sm text-hud-muted">Board Actions, Änderungen und Nachvollziehbarkeit.</p>
                </div>
              </div>

              <div className="tile tile-accent-violet">
                <div className="tile-bg" />
                <div className="tile-border" />
                <div className="relative z-10">
                  <div className="tile-tag">CONTROL</div>
                  <h2 className="mt-3 text-2xl font-semibold">Feature Toggles</h2>
                  <p className="mt-2 text-sm text-hud-muted">Sperre/entsperre Module &amp; Wartungsmodus (coming soon).</p>
                </div>
              </div>

              <div className="tile tile-accent-cyan">
                <div className="tile-bg" />
                <div className="tile-border" />
                <div className="relative z-10">
                  <div className="tile-tag">SECURITY</div>
                  <h2 className="mt-3 text-2xl font-semibold">Rollenverwaltung</h2>
                  <p className="mt-2 text-sm text-hud-muted">Editor-Allowlist / UO / FE (Konfiguration über ENV).</p>
                </div>
              </div>

              <div className="tile tile-accent-emerald">
                <div className="tile-bg" />
                <div className="tile-border" />
                <div className="relative z-10">
                  <div className="tile-tag">EXPORT</div>
                  <h2 className="mt-3 text-2xl font-semibold">Datenexport</h2>
                  <p className="mt-2 text-sm text-hud-muted">CSV/JSON Export (coming soon) – für Auswertung &amp; Backup.</p>
                </div>
              </div>
            </section>

            <div className="mt-10">
              {/* Reuse existing dashboard logic; open directly to Logs */}
              <AppShell defaultTab="log" />
            </div>
          </>
        )}
      </div>
    </main>
  );
}

export default function AdminPage() {
  return (
    <SessionProvider>
      <AdminInner />
    </SessionProvider>
  );
}
