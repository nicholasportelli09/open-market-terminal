/**
 * Turns raw FRED observations into what a card shows: the displayed series (levels, YoY % or
 * monthly change), its latest observation, and changes over about 1 month and 1 year.
 */
import { addMonths, changeOver, monthlyDiff, trailing, trailingMean, yoySeries, type PeriodChange, type Point } from "./math";
import { SERIES, fredSeriesPage, type Frequency, type SeriesDef } from "./series";

export type Reading = {
  def: SeriesDef;
  /** The displayed series (YoY % for price indices, monthly change for payrolls), oldest first. */
  points: Point[];
  latest: Point;
  m1: PeriodChange | null;
  y1: PeriodChange | null;
  /**
   * Payrolls only: the previous month's change, the average of the last 3 monthly changes (only
   * when those months are consecutive) and the total change over 12 months from the level series.
   */
  flow?: { prior: Point | null; avg3: number | null; total12: PeriodChange | null };
  /** Explains a gap, e.g. a month that FRED has no observation for. */
  note?: string;
  url: string;
};

/** How far before the target date a comparison observation may be. Monthly data must match the month. */
export function gapFor(frequency: Frequency): number {
  if (frequency === "Monthly") return 0;
  if (frequency === "Weekly") return 10;
  return 7;
}

export function monthLabel(date: string): string {
  const [y, m] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", year: "numeric" });
}

function missingNote(def: SeriesDef, latest: Point, y1: PeriodChange | null): string | undefined {
  if (y1 || def.frequency !== "Monthly") return undefined;
  return `No ${monthLabel(addMonths(latest.date, -12))} observation on FRED, so no 1-year change.`;
}

function yoyReading(def: SeriesDef, raw: Point[]): Reading | null {
  const points = yoySeries(raw);
  const latest = points.at(-1);
  if (!latest) return null;
  const gap = gapFor(def.frequency);
  const y1 = changeOver(points, latest, 12, gap);
  const lastIndex = raw.at(-1);
  const skipped =
    lastIndex && lastIndex.date !== latest.date
      ? `${monthLabel(lastIndex.date)} has no observation 12 months earlier on FRED, so the latest YoY shown is ${monthLabel(latest.date)}.`
      : undefined;
  return {
    def,
    points,
    latest,
    m1: changeOver(points, latest, 1, gap),
    y1,
    note: skipped ?? missingNote(def, latest, y1),
    url: fredSeriesPage(def.id),
  };
}

function flowReading(def: SeriesDef, raw: Point[]): Reading | null {
  // FRED reports PAYEMS in thousands of jobs.
  const points = monthlyDiff(raw);
  const latest = points.at(-1);
  if (!latest) return null;
  const prior = points.at(-2);
  const consecutive = prior && addMonths(prior.date, 1) === latest.date ? prior : null;
  const last3 = points.slice(-3);
  const avg3 = last3.length === 3 && addMonths(last3[0].date, 2) === latest.date ? trailingMean(points, 3) : null;
  const rawLatest = raw[raw.length - 1];
  return {
    def,
    points,
    latest,
    m1: null,
    y1: null,
    flow: { prior: consecutive, avg3, total12: changeOver(raw, rawLatest, 12, 0) },
    url: fredSeriesPage(def.id),
  };
}

/** A reading for one FRED series; null when it has no usable observations. */
export function buildReading(id: string, raw: Point[] | null | undefined): Reading | null {
  const def = SERIES[id];
  if (!def || !raw || raw.length === 0) return null;
  if (def.kind === "yoy") return yoyReading(def, raw);
  if (def.kind === "flow") return flowReading(def, raw);
  const latest = raw[raw.length - 1];
  const gap = gapFor(def.frequency);
  const y1 = changeOver(raw, latest, 12, gap);
  return { def, points: raw, latest, m1: changeOver(raw, latest, 1, gap), y1, note: missingNote(def, latest, y1), url: fredSeriesPage(id) };
}

/** Sparkline window: the last year of the displayed series (two years for monthly data). */
export function sparkPoints(r: Reading, months?: number): Point[] {
  return trailing(r.points, months ?? (r.def.frequency === "Monthly" ? 24 : 12));
}
