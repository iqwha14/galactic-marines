"use client";

import Link from "next/link";
import OpsPanel from "@/app/_components/OpsPanel";
import { TopBar } from "@/app/_components/Hud";

export default function OpsPage() {
  return (
    <main className="min-h-screen hud-grid px-6 py-10">
      <div className="mx-auto max-w-6xl">
        <TopBar title="Einsatzzentrale" subtitle="OPS / COMMAND" right={<Link href="/" className="btn btn-ghost">← Command Deck</Link>} />
        <OpsPanel />
      </div>
    </main>
  );
}
