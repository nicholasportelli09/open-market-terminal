/**
 * Pure normalisers from documented provider responses to AnalystData sections. No network, no clock:
 * the caller passes `fetchedAt` (when the provider answered) so the output is deterministic in tests.
 *
 * Shapes (FMP stable docs, Nov 2026):
 * - price-target-consensus: [{ symbol, targetHigh, targetLow, targetConsensus, targetMedian }]
 * - price-target-summary:   [{ symbol, lastMonthCount, lastMonthAvgPriceTarget, lastQuarterCount, ..., allTimeAvgPriceTarget, publishers }]
 * - grades-consensus:       [{ symbol, strongBuy, buy, hold, sell, strongSell, consensus }]
 * - grades-historical:      [{ symbol, date, analystRatingsStrongBuy, analystRatingsBuy, analystRatingsHold, analystRatingsSell, analystRatingsStrongSell }]
 * - grades:                 [{ symbol, date, gradingCompany, previousGrade, newGrade, action }]
 * - price-target-news:      [{ symbol, publishedDate, newsURL, newsTitle, analystName, priceTarget, adjPriceTarget, priceWhenPosted, newsPublisher, newsBaseURL, analystCompany }]
 * Finnhub /stock/recommendation: [{ symbol, period, strongBuy, buy, hold, sell, strongSell }]
 */
import {
  RATING_LABEL,
  type AnalystConsensus,
  type AnalystDistribution,
  type AnalystHistory,
  type AnalystRatingRow,
  type AnalystTargets,
  type DistributionMonth,
  type RatingCounts,
} from "@/lib/analyst-types";
import type { Provenance } from "@/lib/provenance";
import { actionOf, consensusFromCounts, countTotal, firmKey, previousTargetFromTitle, ratingKeyOf } from "./ratings";

type Raw = Record<string, unknown>;

const DATE_RE = /^\d{4}-\d{2}-\d{2}/;
/** Most rows kept in the ratings history (newest first). */
export const MAX_HISTORY_ROWS = 600;
/** Monthly distribution snapshots kept (oldest first). */
export const TREND_MONTHS = 12;

function rows(body: unknown): Raw[] {
  if (Array.isArray(body)) return body.filter((r): r is Raw => !!r && typeof r === "object" && !Array.isArray(r));
  if (body && typeof body === "object") return [body as Raw];
  return [];
}

function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

/** Price-like value: finite and above zero, else null. */
function price(v: unknown): number | null {
  const n = num(v);
  return n != null && n > 0 ? n : null;
}

function count(v: unknown): number {
  const n = num(v);
  return n != null && n >= 0 ? Math.round(n) : 0;
}

function text(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function dateKey(v: unknown): string | null {
  const s = text(v);
  return s && DATE_RE.test(s) ? s.slice(0, 10) : null;
}

function fmp(endpoint: string, symbol: string, fetchedAt: string, note?: string): Provenance {
  return { source: "fmp", asOf: fetchedAt, url: `https://site.financialmodelingprep.com/developer/docs/stable/${endpoint}`, note: note ?? `${endpoint} · ${symbol}` };
}

/** Counts from an object with strongBuy/buy/... (or a prefixed variant such as analystRatingsBuy). */
function countsOf(r: Raw, prefix = ""): RatingCounts {
  const k = (name: string) => (prefix ? `${prefix}${name.charAt(0).toUpperCase()}${name.slice(1)}` : name);
  return {
    strongBuy: count(r[k("strongBuy")]),
    buy: count(r[k("buy")]),
    hold: count(r[k("hold")]),
    sell: count(r[k("sell")]),
    strongSell: count(r[k("strongSell")]),
  };
}

/** FMP grades-consensus -> consensus label and counts; null when FMP has no ratings for the symbol. */
export function normConsensusFmp(body: unknown, symbol: string, fetchedAt: string): AnalystConsensus | null {
  const r = rows(body)[0];
  if (!r) return null;
  const counts = countsOf(r);
  const total = countTotal(counts);
  const label = text(r.consensus);
  if (total === 0 && !label) return null;
  const key = ratingKeyOf(label) ?? consensusFromCounts(counts);
  return {
    rating: label ?? (key ? RATING_LABEL[key] : "No consensus"),
    ratingKey: key,
    counts,
    total,
    derived: !label,
    provenance: fmp("grades-summary", symbol, fetchedAt, "Grades consensus"),
  };
}

/** FMP price-target-consensus (+ optional price-target-summary) -> targets; null without any target. */
export function normTargetsFmp(consensus: unknown, summary: unknown, symbol: string, fetchedAt: string): AnalystTargets | null {
  const c = rows(consensus)[0];
  const s = rows(summary)[0];
  const low = price(c?.targetLow);
  const high = price(c?.targetHigh);
  const average = price(c?.targetConsensus);
  const median = price(c?.targetMedian);
  if (low == null && high == null && average == null && median == null) return null;
  const counts = s
    ? { lastMonth: num(s.lastMonthCount), lastQuarter: num(s.lastQuarterCount), lastYear: num(s.lastYearCount), allTime: num(s.allTimeCount) }
    : null;
  return {
    low,
    average,
    median,
    high,
    counts,
    lastYearAverage: s ? price(s.lastYearAvgPriceTarget) : null,
    provenance: fmp("price-target-consensus", symbol, fetchedAt, "12-month price target consensus"),
  };
}

function trendFrom(list: { period: string; counts: RatingCounts }[]): DistributionMonth[] {
  const byPeriod = new Map<string, DistributionMonth>();
  for (const m of list) {
    const total = countTotal(m.counts);
    if (total > 0 && !byPeriod.has(m.period)) byPeriod.set(m.period, { period: m.period, counts: m.counts, total });
  }
  return [...byPeriod.values()].sort((a, b) => a.period.localeCompare(b.period)).slice(-TREND_MONTHS);
}

/** FMP grades-historical -> monthly snapshots (oldest first). */
export function normTrendFmp(body: unknown): DistributionMonth[] {
  return trendFrom(
    rows(body)
      .map((r) => ({ period: dateKey(r.date) ?? "", counts: countsOf(r, "analystRatings") }))
      .filter((m) => m.period),
  );
}

/** Finnhub recommendation trends -> monthly snapshots (oldest first). */
export function normTrendFinnhub(body: unknown): DistributionMonth[] {
  return trendFrom(
    rows(body)
      .map((r) => ({ period: dateKey(r.period) ?? "", counts: countsOf(r) }))
      .filter((m) => m.period),
  );
}

/**
 * Current distribution and monthly trend. Current counts come from the consensus when there is one,
 * else from the latest monthly snapshot. Returns null when nothing has a count.
 */
export function buildDistribution(
  consensus: AnalystConsensus | null,
  trend: DistributionMonth[],
  trendProvenance: Provenance | null,
): AnalystDistribution | null {
  const latest = trend.at(-1) ?? null;
  if (consensus && consensus.total > 0) {
    return { current: consensus.counts, currentTotal: consensus.total, trend, provenance: consensus.provenance, trendProvenance: trend.length ? trendProvenance : null };
  }
  if (!latest || !trendProvenance) return null;
  return {
    current: latest.counts,
    currentTotal: latest.total,
    trend,
    provenance: { ...trendProvenance, note: `${trendProvenance.note ?? ""}${trendProvenance.note ? " · " : ""}month of ${latest.period}` },
    trendProvenance,
  };
}

/** Consensus derived from Finnhub's latest month (Finnhub has no consensus label). */
export function consensusFromTrend(trend: DistributionMonth[], provenance: Provenance): AnalystConsensus | null {
  const latest = trend.at(-1);
  if (!latest) return null;
  const key = consensusFromCounts(latest.counts);
  return {
    rating: key ? RATING_LABEL[key] : "No consensus",
    ratingKey: key,
    counts: latest.counts,
    total: latest.total,
    derived: true,
    provenance: { ...provenance, note: `Recommendation trends, month of ${latest.period}` },
  };
}

export function finnhubProvenance(symbol: string, fetchedAt: string): Provenance {
  return { source: "finnhub", asOf: fetchedAt, url: "https://finnhub.io/docs/api/recommendation-trends", note: `Recommendation trends · ${symbol}` };
}

export function fmpTrendProvenance(symbol: string, fetchedAt: string): Provenance {
  return fmp("historical-grades", symbol, fetchedAt, "Monthly analyst ratings");
}

type TargetNote = { date: string; firm: string; analyst: string | null; target: number | null; oldTarget: number | null; priceWhenPosted: number | null; url: string | null; publisher: string | null; title: string | null };

function targetNotes(body: unknown): TargetNote[] {
  return rows(body)
    .map((r) => {
      const title = text(r.newsTitle);
      return {
        date: dateKey(r.publishedDate) ?? "",
        firm: text(r.analystCompany) ?? "",
        analyst: text(r.analystName),
        target: price(r.priceTarget) ?? price(r.adjPriceTarget),
        oldTarget: previousTargetFromTitle(title),
        priceWhenPosted: price(r.priceWhenPosted),
        url: text(r.newsURL),
        publisher: text(r.newsPublisher),
        title,
      };
    })
    .filter((n) => n.date && n.firm);
}

const DAY_MS = 86_400_000;

function daysApart(a: string, b: string): number {
  return Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DAY_MS;
}

/** Ratings history: FMP grades rows, joined with the price-target note the same firm published within a day. */
export function normHistory(grades: unknown, news: unknown, symbol: string, fetchedAt: string): AnalystHistory | null {
  const notes = targetNotes(news);
  const used = new Set<number>();
  const out: AnalystRatingRow[] = [];

  for (const r of rows(grades)) {
    const date = dateKey(r.date);
    const firm = text(r.gradingCompany);
    if (!date || !firm) continue;
    const oldGrade = text(r.previousGrade);
    const newGrade = text(r.newGrade);
    const key = firmKey(firm);
    const idx = notes.findIndex((n, i) => !used.has(i) && firmKey(n.firm) === key && daysApart(n.date, date) <= 1);
    const note = idx >= 0 ? notes[idx] : null;
    if (idx >= 0) used.add(idx);
    out.push({
      id: `g-${date}-${key}-${out.length}`,
      date,
      firm,
      analyst: note?.analyst ?? null,
      action: actionOf(text(r.action), oldGrade, newGrade),
      ratingOld: oldGrade,
      ratingNew: newGrade,
      ratingKey: ratingKeyOf(newGrade),
      targetOld: note?.oldTarget ?? null,
      targetNew: note?.target ?? null,
      priceWhenPosted: note?.priceWhenPosted ?? null,
      url: note?.url ?? null,
      publisher: note?.publisher ?? null,
    });
  }

  notes.forEach((n, i) => {
    if (used.has(i)) return;
    out.push({
      id: `t-${n.date}-${firmKey(n.firm)}-${i}`,
      date: n.date,
      firm: n.firm,
      analyst: n.analyst,
      action: "target",
      ratingOld: null,
      ratingNew: null,
      ratingKey: null,
      targetOld: n.oldTarget,
      targetNew: n.target,
      priceWhenPosted: n.priceWhenPosted,
      url: n.url,
      publisher: n.publisher,
    });
  });

  if (out.length === 0) return null;
  out.sort((a, b) => b.date.localeCompare(a.date));
  const note = notes.length ? "Grades + price-target news" : "Grades (upgrades / downgrades)";
  return { rows: out.slice(0, MAX_HISTORY_ROWS), provenance: fmp("grades", symbol, fetchedAt, note) };
}
