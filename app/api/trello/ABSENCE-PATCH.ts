/**
 * Patch-Hinweis:
 * Diese Datei ersetzt nur die Abmeldungs-Erkennung im /api/trello route.
 * Wenn du schon eine /app/api/trello/route.ts hast, kopiere NUR die Funktion parseAbsenceLabels
 * und ersetze deine alte Version damit.
 */

export function parseAbsenceLabels(labels: { name: string }[] | undefined) {
  const out: { label: string; from?: string; to?: string }[] = [];
  for (const l of labels ?? []) {
    const name = (l.name ?? "").trim();
    if (!name.toLowerCase().startsWith("abgemeldet")) continue;

    // Accept many formats:
    // "Abgemeldet 17.02.2026-19.02.2026"
    // "Abgemeldet 17.02.26 - 19.02.26"
    // "Abgemeldet 17.02.2026 bis 19.02.2026"
    // "Abgemeldet 17/02/2026-19/02/2026"
    const rest = name.replace(/^abgemeldet\s*/i, "").trim();

    // try to extract two date-ish tokens
    const tokens = rest
      .replace(/\s+bis\s+/gi, "-")
      .replace(/\s+to\s+/gi, "-")
      .split(/\s*[-–—]\s*/);

    const from = tokens[0]?.trim() || undefined;
    const to = tokens[1]?.trim() || undefined;

    out.push({ label: name, from, to });
  }
  return out;
}
