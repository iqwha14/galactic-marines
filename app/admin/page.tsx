import Link from "next/link";
import { requireEditor, requireAdmin } from "@/lib/authz";

export const dynamic = "force-dynamic";

function Denied({ title, detail }: { title: string; detail: string }) {
  return (
    <main className="min-h-screen hud-grid px-6 py-10">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6">
          <Link href="/" className="btn btn-ghost">← Command Deck</Link>
        </div>
        <div className="rounded-2xl border border-marine-500/40 bg-marine-500/10 p-6">
          <div className="text-xs tracking-[0.22em] uppercase text-hud-muted">ACCESS CONTROL</div>
          <h1 className="mt-2 text-3xl font-semibold">{title}</h1>
          <p className="mt-2 text-hud-muted">{detail}</p>
        </div>
      </div>
    </main>
  );
}

export default async function AdminPage() {
  const gate = await requireEditor();
  if (!gate.ok) {
    return <Denied title="Zugriff verweigert" detail={gate.error ?? "Nicht eingeloggt."} />;
  }

  const adminGate = await requireAdmin();

  return (
    <main className="min-h-screen hud-grid px-6 py-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex items-center justify-between gap-3">
          <div>
            <div className="text-xs tracking-[0.22em] uppercase text-hud-muted">ADMIN / CONTROL</div>
            <h1 className="mt-2 text-3xl font-semibold">Verwaltung</h1>
            <p className="mt-2 text-hud-muted">
              Logs für Editors. Rechteverwaltung nur für Admin. Weitere Module: Audit, Export, Feature Toggles, Notfallmodus.
            </p>
          </div>
          <Link href="/" className="btn btn-ghost">← Command Deck</Link>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <section className="rounded-2xl border border-hud-line/80 bg-hud-panel/80 p-5 shadow-hud lg:col-span-2">
            <h2 className="text-sm tracking-[0.22em] uppercase text-hud-muted">Logs</h2>
            <div className="mt-4">
              <a className="btn btn-accent" href="/logs">Logs öffnen</a>
              <div className="mt-3 text-sm text-hud-muted">
                Hinweis: Falls du keine /logs Seite hast, nutze direkt die API <code className="text-white/80">/api/log</code>.
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-hud-line/80 bg-hud-panel/80 p-5 shadow-hud">
            <h2 className="text-sm tracking-[0.22em] uppercase text-hud-muted">Rollen & Rechte</h2>
            <p className="mt-3 text-sm text-hud-muted">
              Rechte vergeben auch für Offline-User (Discord ID).
            </p>
            {adminGate.ok ? (
              <a className="btn btn-accent mt-4" href="/admin/permissions">Permissions Console</a>
            ) : (
              <div className="mt-4 rounded-xl border border-marine-500/40 bg-marine-500/10 p-3 text-sm">
                <div className="font-medium">Admin erforderlich</div>
                <div className="mt-1 text-hud-muted">{adminGate.error}</div>
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-hud-line/80 bg-hud-panel/80 p-5 shadow-hud">
            <h2 className="text-sm tracking-[0.22em] uppercase text-hud-muted">Audit-Trail</h2>
            <p className="mt-3 text-sm text-hud-muted">Optional: gm_audit Tabelle. Sonst wird ein Hinweis angezeigt.</p>
            <a className="btn btn-ghost mt-4" href="/admin/audit">Audit ansehen</a>
          </section>

          <section className="rounded-2xl border border-hud-line/80 bg-hud-panel/80 p-5 shadow-hud">
            <h2 className="text-sm tracking-[0.22em] uppercase text-hud-muted">Datenexport</h2>
            <p className="mt-3 text-sm text-hud-muted">Exportiert Ops + Participants als JSON (Editor).</p>
            <a className="btn btn-ghost mt-4" href="/api/admin/export" target="_blank" rel="noreferrer">Export JSON</a>
          </section>

          <section className="rounded-2xl border border-hud-line/80 bg-hud-panel/80 p-5 shadow-hud">
            <h2 className="text-sm tracking-[0.22em] uppercase text-hud-muted">Feature Toggles</h2>
            <p className="mt-3 text-sm text-hud-muted">Admin-only. Optional: gm_feature_flags Tabelle.</p>
            {adminGate.ok ? (
              <a className="btn btn-ghost mt-4" href="/admin/flags">Flags Console</a>
            ) : (
              <div className="mt-4 text-sm text-hud-muted">Gesperrt.</div>
            )}
          </section>

          <section className="rounded-2xl border border-hud-line/80 bg-hud-panel/80 p-5 shadow-hud">
            <h2 className="text-sm tracking-[0.22em] uppercase text-hud-muted">Notfallmodus</h2>
            <p className="mt-3 text-sm text-hud-muted">Schaltet emergency_lockdown Flag (Admin).</p>
            {adminGate.ok ? (
              <a className="btn btn-ghost mt-4" href="/admin/emergency">Emergency Switch</a>
            ) : (
              <div className="mt-4 text-sm text-hud-muted">Gesperrt.</div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
