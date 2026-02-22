import Link from "next/link";
import { requireAdmin } from "@/lib/authz";
import AutomationsClient from "./ui";

export const dynamic = "force-dynamic";

function Denied({ title, detail }: { title: string; detail: string }) {
  return (
    <main className="min-h-screen hud-grid px-6 py-10">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6">
          <Link href="/admin" className="btn btn-ghost">← Admin</Link>
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

export default async function AutomationsPage() {
  const gate = await requireAdmin();
  if (!gate.ok) return <Denied title="Admin erforderlich" detail={gate.error ?? "Nicht erlaubt."} />;

  return (
    <main className="min-h-screen hud-grid px-6 py-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex items-center justify-between gap-3">
          <div>
            <div className="text-xs tracking-[0.22em] uppercase text-hud-muted">ADMIN / AUTOMATIONS</div>
            <h1 className="mt-2 text-3xl font-semibold">Discord Automationen</h1>
            <p className="mt-2 text-hud-muted">
              Planned Messages + Aktenkontrolle. Läuft über <code className="text-white/80">/api/cron/automations</code>.
            </p>
          </div>
          <Link href="/admin" className="btn btn-ghost">← Admin</Link>
        </div>

        <AutomationsClient />
      </div>
    </main>
  );
}
