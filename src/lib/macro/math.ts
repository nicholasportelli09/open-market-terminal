/**
 * Pure series math for the macro dashboard. Points are FRED-style observations, oldest first,
 * dated YYYY-MM-DD. Nothing here fills gaps or invents values: a lookup that cannot be answered
 * from real observations returns null.
 */

export type Point = { date: string; value: number };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

function toUtc(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((toUtc(b) - toUtc(a)) / DAY_MS);
}

/** Calendar month shift that clamps the day (Mar 31 - 1 month = Feb 28/29). */
export function addMonths(date: string, months: number): string {
  if (!DATE_RE.test(date)) throw new Error(`Invalid date: ${date}`);
  const [y, m, d] = date.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(d, lastDay));
  return first.toISOString().slice(0, 10);
}

/**
 * The last observation dated on or before `date`, provided it is no more than `maxGapDays` older
 * than `date` (so a series with a long hole does not answer with a value from far earlier).
 */
export function onOrBefore(points: readonly Point[], date: string, maxGapDays: number): Point | null {
  for (let i = points.length - 1; i >= 0; i--) {
    const p = points[i];
    if (p.date > date) continue;
    return daysBetween(p.date, date) <= maxGapDays ? p : null;
  }
  return null;
}

export type PeriodChange = {
  /** The earlier observation compared against. */
  from: Point;
  /** latest - from, in the series' own units (percentage points for rates). */
  diff: number;
  /** latest / from - 1, as a percent; null when `from` is zero or the signs differ. */
  pct: number | null;
};

/** Default tolerance: about a third of a month for 1m, a month and a half for 1y. */
export function defaultGap(months: number): number {
  return months <= 1 ? 12 : 45;
}

/**
 * Change of `latest` against the observation on or before `latest.date - months`. Works for daily
 * (weekends, holidays), weekly and monthly series alike. For monthly series pass a gap of at least 31.
 */
export function changeOver(
  points: readonly Point[],
  latest: Point,
  months: number,
  maxGapDays = defaultGap(months),
): PeriodChange | null {
  const target = addMonths(latest.date, -months);
  const from = onOrBefore(points, target, maxGapDays);
  if (!from || from.date >= latest.date) return null;
  const diff = latest.value - from.value;
  const pct = from.value !== 0 && Math.sign(from.value) === Math.sign(latest.value) ? (latest.value / from.value - 1) * 100 : null;
  return { from, diff, pct };
}

function monthKey(date: string): string {
  return date.slice(0, 7);
}

function shiftMonthKey(key: string, months: number): string {
  return addMonths(`${key}-01`, months).slice(0, 7);
}

/**
 * Year-over-year percent change of a monthly index (CPI, PCE price index): each month against the
 * same month one year earlier. Months without a year-earlier observation are left out.
 */
export function yoySeries(points: readonly Point[]): Point[] {
  const byMonth = new Map(points.map((p) => [monthKey(p.date), p.value]));
  const out: Point[] = [];
  for (const p of points) {
    const prior = byMonth.get(shiftMonthKey(monthKey(p.date), -12));
    if (prior === undefined || prior === 0) continue;
    out.push({ date: p.date, value: (p.value / prior - 1) * 100 });
  }
  return out;
}

/** Month-on-month difference of a monthly level (payrolls). Requires consecutive months. */
export function monthlyDiff(points: readonly Point[]): Point[] {
  const out: Point[] = [];
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const cur = points[i];
    if (shiftMonthKey(monthKey(prev.date), 1) !== monthKey(cur.date)) continue;
    out.push({ date: cur.date, value: cur.value - prev.value });
  }
  return out;
}

/** Points dated after `latest.date - months` (for sparklines). */
export function trailing(points: readonly Point[], months: number): Point[] {
  const last = points.at(-1);
  if (!last) return [];
  const start = addMonths(last.date, -months);
  return points.filter((p) => p.date > start);
}

/** Mean of the last `n` values; null when there are fewer than n. */
export function trailingMean(points: readonly Point[], n: number): number | null {
  if (points.length < n || n <= 0) return null;
  const tail = points.slice(-n);
  return tail.reduce((s, p) => s + p.value, 0) / n;
}

/** True when any observation in the trailing window is below zero (e.g. an inverted curve). */
export function wasNegativeWithin(points: readonly Point[], months: number): boolean {
  return trailing(points, months).some((p) => p.value < 0);
}

/**
 * The most recent observation whose value differs from the one before it (a policy-rate move),
 * with the size of the move. Null when the series never changes in the window.
 */
export function lastMove(points: readonly Point[]): { date: string; diff: number } | null {
  for (let i = points.length - 1; i > 0; i--) {
    const diff = points[i].value - points[i - 1].value;
    if (Math.abs(diff) > 1e-9) return { date: points[i].date, diff };
  }
  return null;
}

/** First day of the month `years` before `today` (stable cache key for /api/fred start). */
export function startYearsBack(today: Date, years: number): string {
  const y = today.getUTCFullYear() - years;
  const m = String(today.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}
