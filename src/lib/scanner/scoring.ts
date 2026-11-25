/**
 * Pure, deterministic scoring for the opportunity scanner. No network, no AI.
 *
 * - Each metric is turned into a percentile rank (0-100) among the screened companies it applies to that have
 *   a value. Ties share the average rank. "Lower is better" metrics are flipped (100 - rank).
 * - A factor score is the mean of its metric percentiles, and needs at least MIN_METRICS_PER_FACTOR metrics.
 *   Missing metrics are excluded, never imputed.
 * - The composite is the weighted mean of the available factor scores with the user's weights, and needs at
 *   least MIN_FACTORS_FOR_COMPOSITE factors. Otherwise it is null ("insufficient data").
 * These are relative ranks within this universe, not probabilities or forecasts.
 */
import { FACTORS, MIN_FACTORS_FOR_COMPOSITE, MIN_METRICS_PER_FACTOR, appliesTo, type FactorId, type Weights } from "./factors";
import type { ScanMetricKey } from "./types";

export type ScoringInput = {
  symbol: string;
  financial: boolean;
  values: Partial<Record<ScanMetricKey, number | null>>;
};

export type MetricScore = {
  key: ScanMetricKey;
  value: number;
  /** Percentile rank after direction is applied: 100 = best in the universe on this metric. */
  score: number;
  better: "high" | "low";
  /** How many companies were ranked on this metric. */
  peers: number;
};

export type FactorScore = {
  id: FactorId;
  /** null when fewer than MIN_METRICS_PER_FACTOR metrics were available. */
  score: number | null;
  used: MetricScore[];
  /** Applicable metrics with no value (excluded, not imputed). */
  missing: ScanMetricKey[];
};

export type CompositeScore =
  | { ok: true; value: number; factorsUsed: FactorId[] }
  | { ok: false; reason: string; factorsUsed: FactorId[] };

export type ScoredRow = { symbol: string; factors: Record<FactorId, FactorScore>; composite: CompositeScore };

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * Percentile ranks 0-100 for the non-null values; null stays null. With ties, each tied value gets the average
 * of the ranks it spans. A single value ranks 50. `better: "low"` flips the scale so 100 is always best.
 */
export function percentileRanks(values: readonly (number | null | undefined)[], better: "high" | "low" = "high"): (number | null)[] {
  const present = values.filter(finite);
  const n = present.length;
  return values.map((v) => {
    if (!finite(v)) return null;
    if (n === 1) return 50;
    let below = 0;
    let equal = 0;
    for (const x of present) {
      if (x < v) below++;
      else if (x === v) equal++;
    }
    const rank = ((below + (equal - 1) / 2) / (n - 1)) * 100;
    return better === "high" ? rank : 100 - rank;
  });
}

const mean = (xs: number[]): number => xs.reduce((s, x) => s + x, 0) / xs.length;

type RankTable = Map<string, Map<string, { score: number; peers: number }>>;

/** Per (factor-metric applicability, key): symbol -> percentile. Keyed by applies+key so P/E ranks once. */
function rankAll(rows: readonly ScoringInput[]): RankTable {
  const table: RankTable = new Map();
  for (const f of FACTORS) {
    for (const m of f.metrics) {
      const id = `${m.applies}:${m.key}:${m.better}`;
      if (table.has(id)) continue;
      const eligible = rows.filter((r) => appliesTo(m.applies, r.financial));
      const vals = eligible.map((r) => r.values[m.key] ?? null);
      const ranks = percentileRanks(vals, m.better);
      const peers = vals.filter(finite).length;
      const bySymbol = new Map<string, { score: number; peers: number }>();
      eligible.forEach((r, i) => {
        const score = ranks[i];
        if (score !== null) bySymbol.set(r.symbol, { score, peers });
      });
      table.set(id, bySymbol);
    }
  }
  return table;
}

function factorFor(row: ScoringInput, factorId: FactorId, table: RankTable): FactorScore {
  const def = FACTORS.find((f) => f.id === factorId);
  if (!def) throw new Error(`Unknown factor ${factorId}`);
  const used: MetricScore[] = [];
  const missing: ScanMetricKey[] = [];
  for (const m of def.metrics) {
    if (!appliesTo(m.applies, row.financial)) continue;
    const hit = table.get(`${m.applies}:${m.key}:${m.better}`)?.get(row.symbol);
    const value = row.values[m.key];
    if (!hit || !finite(value)) {
      missing.push(m.key);
      continue;
    }
    used.push({ key: m.key, value, score: hit.score, better: m.better, peers: hit.peers });
  }
  const score = used.length >= MIN_METRICS_PER_FACTOR ? mean(used.map((u) => u.score)) : null;
  return { id: factorId, score, used, missing };
}

/** Weighted mean of the available factors; needs MIN_FACTORS_FOR_COMPOSITE of them and a positive weight sum. */
export function compositeScore(factors: Record<FactorId, FactorScore>, weights: Weights): CompositeScore {
  const available = FACTORS.map((f) => f.id).filter((id) => factors[id].score !== null);
  if (available.length < MIN_FACTORS_FOR_COMPOSITE) {
    return { ok: false, reason: `Insufficient data: ${available.length} of 5 factors scored (needs ${MIN_FACTORS_FOR_COMPOSITE}).`, factorsUsed: available };
  }
  const w = (id: FactorId) => (finite(weights[id]) && weights[id] > 0 ? weights[id] : 0);
  const total = available.reduce((s, id) => s + w(id), 0);
  if (total <= 0) return { ok: false, reason: "All available factors have zero weight.", factorsUsed: available };
  const value = available.reduce((s, id) => s + w(id) * (factors[id].score as number), 0) / total;
  return { ok: true, value, factorsUsed: available.filter((id) => w(id) > 0) };
}

/** Scores every row against the whole screened set. Order of the output follows the input. */
export function scoreUniverse(rows: readonly ScoringInput[], weights: Weights): ScoredRow[] {
  const table = rankAll(rows);
  return rows.map((row) => {
    const factors = Object.fromEntries(FACTORS.map((f) => [f.id, factorFor(row, f.id, table)])) as Record<FactorId, FactorScore>;
    return { symbol: row.symbol, factors, composite: compositeScore(factors, weights) };
  });
}

/** Clamps user weights to 0..max integers; non-numbers become 0. */
export function sanitizeWeights(raw: unknown, fallback: Weights, max = 100): Weights {
  if (!raw || typeof raw !== "object") return fallback;
  const r = raw as Record<string, unknown>;
  const out = { ...fallback };
  for (const f of FACTORS) {
    const v = r[f.id];
    if (finite(v)) out[f.id] = Math.min(max, Math.max(0, Math.round(v)));
  }
  return out;
}
