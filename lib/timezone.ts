/**
 * Minimal timezone helpers (no extra deps).
 *
 * We keep this small and deterministic for server-side scheduling.
 */

export type IsoDow = 1 | 2 | 3 | 4 | 5 | 6 | 7; // ISO: 1=Mon .. 7=Sun

function parseHHMM(s: string): { h: number; m: number } | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(s || "").trim());
  if (!m) return null;
  return { h: Number(m[1]), m: Number(m[2]) };
}

function tzOffsetMinutes(timeZone: string, at: Date): number {
  // Uses shortOffset -> e.g. "GMT+1"
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "shortOffset",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(at);
  const tz = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  // tz is like "GMT+1" or "GMT+01:00" or "UTC+1" depending on runtime
  const mm = /(GMT|UTC)([+-])(\d{1,2})(?::?(\d{2}))?/i.exec(tz);
  if (!mm) return 0;
  const sign = mm[2] === "-" ? -1 : 1;
  const hh = Number(mm[3] || 0);
  const mins = Number(mm[4] || 0);
  return sign * (hh * 60 + mins);
}

export function zonedTimeToUtc(params: {
  timeZone: string;
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number;
  minute: number;
}): Date {
  const { timeZone, year, month, day, hour, minute } = params;

  // Start with a naive UTC timestamp for the local components.
  let utcMs = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  // Iteratively adjust using actual offset at guessed instant.
  for (let i = 0; i < 2; i++) {
    const off = tzOffsetMinutes(timeZone, new Date(utcMs));
    utcMs = Date.UTC(year, month - 1, day, hour, minute, 0, 0) - off * 60_000;
  }
  return new Date(utcMs);
}

export function getZonedParts(timeZone: string, at: Date = new Date()): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  isoDow: IsoDow;
} {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    weekday: "short",
  });
  const parts = dtf.formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value;
  const year = Number(get("year"));
  const month = Number(get("month"));
  const day = Number(get("day"));
  const hour = Number(get("hour"));
  const minute = Number(get("minute"));
  const second = Number(get("second"));
  const weekday = (get("weekday") || "").toLowerCase();
  const map: Record<string, IsoDow> = {
    mon: 1,
    tue: 2,
    wed: 3,
    thu: 4,
    fri: 5,
    sat: 6,
    sun: 7,
  };
  const isoDow = map[weekday.slice(0, 3)] ?? 1;
  return { year, month, day, hour, minute, second, isoDow };
}

export function computeNextRunAt(params: {
  schedule: "once" | "daily" | "weekly";
  timeZone: string;
  now?: Date;
  runAt?: string | null; // ISO
  timeOfDay?: string | null; // HH:MM
  dayOfWeek?: number | null; // 1-7
}): Date | null {
  const now = params.now ?? new Date();
  const tz = params.timeZone || "Europe/Berlin";

  if (params.schedule === "once") {
    if (!params.runAt) return null;
    const d = new Date(params.runAt);
    if (isNaN(d.getTime())) return null;
    return d;
  }

  const hhmm = parseHHMM(params.timeOfDay ?? "");
  if (!hhmm) return null;

  // Find the next candidate in the future by scanning up to 8 days.
  const base = getZonedParts(tz, now);
  for (let addDays = 0; addDays <= 8; addDays++) {
    // Create a date by starting from now (UTC) + addDays, then extract zoned date parts.
    const probe = new Date(now.getTime() + addDays * 86_400_000);
    const z = getZonedParts(tz, probe);
    if (params.schedule === "weekly") {
      const dow = Number(params.dayOfWeek ?? 0);
      if (!(dow >= 1 && dow <= 7)) return null;
      if (z.isoDow !== dow) continue;
    }

    const utc = zonedTimeToUtc({
      timeZone: tz,
      year: z.year,
      month: z.month,
      day: z.day,
      hour: hhmm.h,
      minute: hhmm.m,
    });

    if (utc.getTime() > now.getTime() + 10_000) return utc; // 10s safety
  }

  // Fallback: if nothing found, push by 1 day.
  const fallback = new Date(now.getTime() + 86_400_000);
  const z = getZonedParts(tz, fallback);
  return zonedTimeToUtc({ timeZone: tz, year: z.year, month: z.month, day: z.day, hour: hhmm.h, minute: hhmm.m });
}
