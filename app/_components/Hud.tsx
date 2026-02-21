"use client";

export function HudCard({
  title,
  right,
  children,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-hud-panel/80 shadow-hud border border-hud-line/80">
      <div className="scanline absolute inset-0" />
      <div className="relative p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm tracking-[0.22em] uppercase text-hud-muted">{title}</h2>
          <div className="h-px flex-1 bg-gradient-to-r from-hud-line/0 via-hud-line/80 to-hud-line/0" />
          {right ?? <span className="text-xs text-marine-300/90">GM // HUD</span>}
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

export function TopBar({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle: string;
  right?: React.ReactNode;
}) {
  return (
    <header className="mb-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-xs tracking-[0.22em] uppercase text-hud-muted">{subtitle}</div>
          <h1 className="mt-2 text-3xl font-semibold tracking-wide">{title}</h1>
        </div>
        <div className="flex items-center gap-2">{right}</div>
      </div>
      <div className="mt-4 h-px bg-gradient-to-r from-marine-500/0 via-marine-500/35 to-marine-500/0" />
    </header>
  );
}
