/**
 * Treasury curve snapshots for the curve chart: the latest common date, about 1 month and about
 * 1 year earlier. Each tenor uses its own last observation on or before the snapshot date (at most
 * 7 days earlier); a tenor without one is left out of that snapshot rather than filled.
 */
import { addMonths, onOrBefore, type Point } from "./math";
import { TREASURY_TENORS } from "./series";

export type CurvePoint = { id: string; tenor: string; years: number; value: number; date: string };

export type CurveSnapshot = { key: "now" | "m1" | "y1"; label: string; date: string; points: CurvePoint[] };

const MAX_GAP_DAYS = 7;
/** A snapshot needs at least this many tenors to be drawn as a curve. */
export const MIN_TENORS = 4;

function snapshot(series: Record<string, readonly Point[] | undefined>, date: string): CurvePoint[] {
  const out: CurvePoint[] = [];
  for (const t of TREASURY_TENORS) {
    const pts = series[t.id];
    const p = pts ? onOrBefore(pts, date, MAX_GAP_DAYS) : null;
    if (p) out.push({ id: t.id, tenor: t.tenor, years: t.years, value: p.value, date: p.date });
  }
  return out;
}

/** Latest date any tenor has an observation for. */
export function latestCurveDate(series: Record<string, readonly Point[] | undefined>): string | null {
  let best: string | null = null;
  for (const t of TREASURY_TENORS) {
    const last = series[t.id]?.at(-1);
    if (last && (!best || last.date > best)) best = last.date;
  }
  return best;
}

/** Up to three snapshots (latest, ~1m, ~1y), each with at least MIN_TENORS tenors. */
export function curveSnapshots(series: Record<string, readonly Point[] | undefined>): CurveSnapshot[] {
  const latest = latestCurveDate(series);
  if (!latest) return [];
  const defs: { key: CurveSnapshot["key"]; label: string; date: string }[] = [
    { key: "now", label: "Latest", date: latest },
    { key: "m1", label: "1 month ago", date: addMonths(latest, -1) },
    { key: "y1", label: "1 year ago", date: addMonths(latest, -12) },
  ];
  return defs
    .map((d) => {
      const points = snapshot(series, d.date);
      // Label a snapshot by the latest observation it actually uses.
      const date = points.reduce((m, p) => (p.date > m ? p.date : m), "");
      return { key: d.key, label: d.label, date, points };
    })
    .filter((s) => s.points.length >= MIN_TENORS);
}
