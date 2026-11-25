/** Pure table helpers: score the screen with the user's weights, rank, filter and sort. */
import { FACTOR_IDS, type FactorId, type Weights } from "./factors";
import { scoreUniverse, type ScoredRow, type ScoringInput } from "./scoring";
import type { ScanMetricKey, ScreenRow } from "./types";

export type ViewRow = { row: ScreenRow; scored: ScoredRow; rank: number | null };

/** Key metrics shown as table columns (also sortable). */
export const KEY_METRICS = ["pe", "fcfYield", "revenueGrowthTTM", "volatility1y"] as const satisfies readonly ScanMetricKey[];

export type SortKey = "rank" | "symbol" | "sector" | "price" | "marketCap" | "composite" | FactorId | (typeof KEY_METRICS)[number];
export type Sort = { key: SortKey; dir: "asc" | "desc" };

export type Filters = {
  query: string;
  sector: string;
  /** Minimum market cap in USD; 0 = any. */
  minMarketCap: number;
  /** Minimum score (0-100) on `scoreOf`; 0 = any. Rows without that score are hidden when min > 0. */
  minScore: number;
  scoreOf: FactorId | "composite";
};

export const DEFAULT_FILTERS: Filters = { query: "", sector: "all", minMarketCap: 0, minScore: 0, scoreOf: "composite" };

export function scoringInput(row: ScreenRow): ScoringInput {
  const values: ScoringInput["values"] = {};
  for (const [k, m] of Object.entries(row.metrics) as [ScanMetricKey, ScreenRow["metrics"][ScanMetricKey]][]) values[k] = m.value;
  return { symbol: row.symbol, financial: row.financialCompany, values };
}

/** Scores the whole screen and ranks by composite (1 = highest); rows without a composite get rank null. */
export function buildView(rows: readonly ScreenRow[], weights: Weights): ViewRow[] {
  const scored = scoreUniverse(rows.map(scoringInput), weights);
  const order = scored
    .map((s, i) => ({ i, v: s.composite.ok ? s.composite.value : null }))
    .filter((x): x is { i: number; v: number } => x.v !== null)
    .sort((a, b) => b.v - a.v || rows[a.i].symbol.localeCompare(rows[b.i].symbol));
  const rankOf = new Map(order.map((x, n) => [x.i, n + 1]));
  return rows.map((row, i) => ({ row, scored: scored[i], rank: rankOf.get(i) ?? null }));
}

export function scoreValue(v: ViewRow, id: FactorId | "composite"): number | null {
  if (id === "composite") return v.scored.composite.ok ? v.scored.composite.value : null;
  return v.scored.factors[id].score;
}

export function filterView(list: readonly ViewRow[], f: Filters): ViewRow[] {
  const q = f.query.trim().toLowerCase();
  return list.filter((v) => {
    if (q && !v.row.symbol.toLowerCase().includes(q) && !v.row.name.toLowerCase().includes(q)) return false;
    if (f.sector !== "all" && v.row.sector !== f.sector) return false;
    if (f.minMarketCap > 0) {
      const mc = v.row.metrics.marketCap.value;
      if (mc === null || mc < f.minMarketCap) return false;
    }
    if (f.minScore > 0) {
      const s = scoreValue(v, f.scoreOf);
      if (s === null || s < f.minScore) return false;
    }
    return true;
  });
}

function sortValue(v: ViewRow, key: SortKey): number | string | null {
  if (key === "rank") return v.rank;
  if (key === "symbol") return v.row.symbol;
  if (key === "sector") return v.row.sector;
  if (key === "price") return v.row.price.value;
  if (key === "marketCap") return v.row.metrics.marketCap.value;
  if (key === "composite" || (FACTOR_IDS as readonly string[]).includes(key)) return scoreValue(v, key as FactorId | "composite");
  return v.row.metrics[key as ScanMetricKey].value;
}

/** Sorted copy; missing values always sort last whatever the direction. */
export function sortView(list: readonly ViewRow[], sort: Sort): ViewRow[] {
  const sign = sort.dir === "asc" ? 1 : -1;
  return [...list].sort((a, b) => {
    const x = sortValue(a, sort.key);
    const y = sortValue(b, sort.key);
    if (x === null && y === null) return a.row.symbol.localeCompare(b.row.symbol);
    if (x === null) return 1;
    if (y === null) return -1;
    const d = typeof x === "string" ? x.localeCompare(String(y)) : x - (y as number);
    return d !== 0 ? sign * d : a.row.symbol.localeCompare(b.row.symbol);
  });
}

/** Natural first direction for a column: text and rank ascending, figures descending. */
export function defaultDir(key: SortKey): "asc" | "desc" {
  return key === "rank" || key === "symbol" || key === "sector" || key === "volatility1y" || key === "pe" ? "asc" : "desc";
}

export function sectorsOf(rows: readonly ScreenRow[]): string[] {
  return [...new Set(rows.map((r) => r.sector))].sort();
}
