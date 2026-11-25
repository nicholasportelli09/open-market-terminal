/**
 * Pure period math over SEC XBRL companyfacts (no network). A fact's fy/fp describe the FILING it came
 * from, not the period, so periods are identified by their start/end dates only.
 */

export type RawFact = {
  start?: string;
  end: string;
  val: number;
  accn: string;
  fy?: number | null;
  fp?: string | null;
  form: string;
  filed: string;
  frame?: string;
};
export type RawConcept = { label?: string | null; units: Record<string, RawFact[]> };
export type CompanyFactsRaw = {
  cik: number | string;
  entityName: string;
  facts: Record<string, Record<string, RawConcept> | undefined>;
  /** Latest period end per taxonomy, recorded by trimFacts before concepts are dropped. */
  latestEnds?: Record<string, string>;
};

/** One value for one period, traced to the filing it came from. */
export type PeriodValue = {
  start: string | null;
  end: string;
  value: number;
  accn: string;
  form: string;
  filed: string;
  concept: string;
  /** Fiscal year label (annual values only). */
  fiscalYear?: number;
  /** True when computed from cumulative figures (e.g. Q4 = FY minus 9 months). */
  derived?: boolean;
};

export type Flow = { concept: string; annual: PeriodValue[]; quarters: PeriodValue[] };

export type Ttm = {
  value: number;
  start: string;
  end: string;
  basis: "annual" | "quarters";
  pieces: PeriodValue[];
};

const ANNUAL_FORMS = new Set(["10-K", "10-K/A", "10-KT", "10-KT/A", "20-F", "20-F/A", "40-F", "40-F/A"]);
const PERIODIC_FORMS = new Set([...ANNUAL_FORMS, "10-Q", "10-Q/A"]);
const QUARTER_DAYS = { min: 75, max: 105 };
const YEAR_DAYS = { min: 340, max: 380 };
const CONTIGUOUS_MAX_GAP = 4;
const DAY_MS = 86_400_000;
const FY_DRIFT_DAYS = 7;

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / DAY_MS);
}

function addDays(date: string, n: number): string {
  return new Date(Date.parse(date) + n * DAY_MS).toISOString().slice(0, 10);
}

function inRange(n: number, r: { min: number; max: number }): boolean {
  return n >= r.min && n <= r.max;
}

/** Later filing wins; on the same day the later accession number wins. */
function newer(a: RawFact, b: RawFact): boolean {
  return a.filed > b.filed || (a.filed === b.filed && a.accn > b.accn);
}

function dedupe(points: RawFact[], key: (p: RawFact) => string): RawFact[] {
  const best = new Map<string, RawFact>();
  for (const p of points) {
    const k = key(p);
    const cur = best.get(k);
    if (!cur || newer(p, cur)) best.set(k, p);
  }
  return [...best.values()].sort((a, b) => (a.end < b.end ? -1 : a.end > b.end ? 1 : 0));
}

function toPeriod(p: RawFact, concept: string, extra: Partial<PeriodValue> = {}): PeriodValue {
  return { start: p.start ?? null, end: p.end, value: p.val, accn: p.accn, form: p.form, filed: p.filed, concept, ...extra };
}

/** Facts of one concept in one unit, e.g. ("us-gaap", "Revenues", "USD"). */
export function conceptFacts(facts: CompanyFactsRaw, taxonomy: string, concept: string, unit: string): RawFact[] {
  const list = facts.facts[taxonomy]?.[concept]?.units?.[unit];
  return Array.isArray(list) ? list.filter((p) => typeof p.val === "number" && Number.isFinite(p.val)) : [];
}

/** Calendar year a fiscal year "belongs" to before the company's offset; a week back absorbs 52/53-week drift. */
function baseYear(end: string): number {
  return Number(addDays(end, -FY_DRIFT_DAYS).slice(0, 4));
}

/**
 * The company's naming offset (fy label minus base year), the most common one across its annual filings.
 * SEC's fy field is unreliable for January-March year ends (one filing can carry last year's fy), so it
 * is only used to learn the convention, never to label a period directly.
 */
function fyOffset(ownPeriods: { end: string; fy: number | null }[]): number {
  const counts = new Map<number, number>();
  for (const { end, fy } of ownPeriods) {
    if (fy === null) continue;
    const off = fy - baseYear(end);
    counts.set(off, (counts.get(off) ?? 0) + 1);
  }
  let best = 0;
  let bestCount = 0;
  for (const [off, n] of counts) if (n > bestCount || (n === bestCount && off > best)) [best, bestCount] = [off, n];
  return best;
}

/** Fiscal-year values from annual reports, one per period end (latest filing wins, so restatements apply). */
export function annualSeries(points: RawFact[], concept: string): PeriodValue[] {
  const annual = points.filter(
    (p) => p.start && ANNUAL_FORMS.has(p.form) && inRange(daysBetween(p.start, p.end), YEAR_DAYS),
  );
  // The filing's own period is the latest period it reports; its fy shows the naming convention.
  const ownPeriod = new Map<string, { end: string; fy: number | null }>();
  for (const p of annual) {
    const cur = ownPeriod.get(p.accn);
    if (!cur || p.end > cur.end) ownPeriod.set(p.accn, { end: p.end, fy: typeof p.fy === "number" ? p.fy : null });
  }
  const offset = fyOffset([...ownPeriod.values()]);
  return dedupe(annual, (p) => p.end).map((p) => toPeriod(p, concept, { fiscalYear: baseYear(p.end) + offset }));
}

/** Sum of discrete quarters chained from `start` whose last quarter ends exactly at `end`, or null. */
function chainSum(quarters: Map<string, PeriodValue>, start: string, end: string): number | null {
  const list = [...quarters.values()];
  let cursor = start;
  let sum = 0;
  for (let i = 0; i < 4; i++) {
    const q = list.find((x) => x.start && Math.abs(daysBetween(cursor, x.start)) <= CONTIGUOUS_MAX_GAP);
    if (!q) return null;
    sum += q.value;
    if (q.end === end) return sum;
    if (q.end > end) return null;
    cursor = addDays(q.end, 1);
  }
  return null;
}

/**
 * Discrete quarterly values. Reported 3-month figures are used as is. Missing quarters are derived from
 * cumulative figures with the same start (e.g. Q2 = 6M - Q1, Q4 = FY - 9M or FY - (Q1+Q2+Q3)), only when
 * every piece exists. Nothing is interpolated.
 */
export function discreteQuarters(points: RawFact[], concept: string): PeriodValue[] {
  const durations = dedupe(
    points.filter((p) => p.start && PERIODIC_FORMS.has(p.form)),
    (p) => `${p.start}|${p.end}`,
  );
  const quarters = new Map<string, PeriodValue>();
  for (const p of durations) {
    if (inRange(daysBetween(p.start as string, p.end), QUARTER_DAYS)) quarters.set(p.end, toPeriod(p, concept));
  }
  const cumulative = durations.filter((p) => daysBetween(p.start as string, p.end) > QUARTER_DAYS.max);

  let changed = true;
  while (changed) {
    changed = false;
    for (const c of cumulative) {
      if (quarters.has(c.end)) continue;
      const start = c.start as string;
      // Earlier cumulative value with the same start, ending one quarter before c.end.
      const sameStart = durations.find(
        (p) => p.start === start && inRange(daysBetween(p.end, c.end), QUARTER_DAYS),
      );
      let prior: { end: string; value: number } | null = sameStart ? { end: sameStart.end, value: sameStart.val } : null;
      if (!prior) {
        const candidates = [...quarters.values()].filter((q) => inRange(daysBetween(q.end, c.end), QUARTER_DAYS));
        for (const q of candidates) {
          const sum = chainSum(quarters, start, q.end);
          if (sum !== null) prior = { end: q.end, value: sum };
        }
      }
      if (!prior) continue;
      quarters.set(c.end, toPeriod(c, concept, { start: addDays(prior.end, 1), value: c.val - prior.value, derived: true }));
      changed = true;
    }
  }
  return [...quarters.values()].sort((a, b) => (a.end < b.end ? -1 : 1));
}

export function buildFlow(points: RawFact[], concept: string): Flow {
  return { concept, annual: annualSeries(points, concept), quarters: discreteQuarters(points, concept) };
}

export function latestEnd(flow: Flow): string | null {
  const a = flow.annual.at(-1)?.end ?? "";
  const q = flow.quarters.at(-1)?.end ?? "";
  const best = a > q ? a : q;
  return best || null;
}

/**
 * Trailing twelve months ending at `end` (default: the latest period). A fiscal year ending there is
 * used directly; otherwise the four contiguous discrete quarters ending there are summed. Returns null
 * when any quarter is missing.
 */
export function ttmAt(flow: Flow, end: string | null = latestEnd(flow)): Ttm | null {
  if (!end) return null;
  const fy = flow.annual.find((a) => a.end === end);
  if (fy && fy.start) return { value: fy.value, start: fy.start, end, basis: "annual", pieces: [fy] };

  const pieces: PeriodValue[] = [];
  let cur = flow.quarters.find((q) => q.end === end);
  while (cur && pieces.length < 4) {
    pieces.unshift(cur);
    const curStart = cur.start;
    if (!curStart) return null;
    cur = flow.quarters.find((q) => {
      const gap = daysBetween(q.end, curStart);
      return gap >= 0 && gap <= CONTIGUOUS_MAX_GAP;
    });
  }
  if (pieces.length < 4 || !pieces[0].start) return null;
  const value = pieces.reduce((s, p) => s + p.value, 0);
  return { value, start: pieces[0].start, end, basis: "quarters", pieces };
}

/** The same trailing window one year earlier, or null when it cannot be built from filed data. */
export function ttmYearBefore(flow: Flow, ttm: Ttm): Ttm | null {
  const ends = [...flow.annual, ...flow.quarters].map((p) => p.end);
  const target = ends.find((e) => inRange(daysBetween(e, ttm.end), YEAR_DAYS));
  return target ? ttmAt(flow, target) : null;
}

/** Instant (balance sheet) value of one concept at exactly `date`, latest filing wins. */
export function instantAt(points: RawFact[], concept: string, date: string): PeriodValue | null {
  const hits = points.filter((p) => !p.start && p.end === date && PERIODIC_FORMS.has(p.form));
  if (hits.length === 0) return null;
  return toPeriod(hits.reduce((best, p) => (newer(p, best) ? p : best)), concept);
}

export function latestInstantDate(points: RawFact[]): string | null {
  let best = "";
  for (const p of points) if (!p.start && PERIODIC_FORMS.has(p.form) && p.end > best) best = p.end;
  return best || null;
}

/**
 * Cover-page shares outstanding (dei). Companies with several share classes report one fact per class
 * for the same date and filing; those are summed.
 */
export function coverShares(points: RawFact[]): { value: number; end: string; accn: string; form: string; filed: string; classes: number } | null {
  const instants = points.filter((p) => !p.start);
  if (instants.length === 0) return null;
  const end = instants.reduce((m, p) => (p.end > m ? p.end : m), "");
  const atEnd = instants.filter((p) => p.end === end);
  const latest = atEnd.reduce((best, p) => (newer(p, best) ? p : best));
  const sameFiling = atEnd.filter((p) => p.accn === latest.accn);
  const value = sameFiling.reduce((s, p) => s + p.val, 0);
  return { value, end, accn: latest.accn, form: latest.form, filed: latest.filed, classes: sameFiling.length };
}

export function filingUrl(cik: number | string, accn: string): string {
  return `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accn.replace(/-/g, "")}/`;
}
