/**
 * Trading multiples and comps.
 *
 * Units: price and eps are per share; shares, netDebt, ebitda, ebit, revenue, fcf and bookValue are totals in
 * one currency and share unit (e.g. USD millions and millions of shares), so marketCap = price * shares is in
 * the same unit. bookValue is total common equity (not per share).
 *
 * Equity multiples (P/E, P/FCF, P/B) compare market cap (or price) with an equity metric.
 * Enterprise multiples (EV/EBITDA, EV/EBIT, EV/Sales) compare EV = marketCap + netDebt + otherAdjustments with an
 * operating metric, so the implied price must subtract those claims again:
 * (multiple * metric - netDebt - otherAdjustments) / shares. This is the same equity bridge as the DCF.
 */

import { isFiniteNumber } from "./validate";

export type CompanyMetrics = {
  /** Optional label for peer tables and exclusion lists. */
  symbol?: string;
  price: number;
  shares: number;
  netDebt: number;
  /** Other non-common claims (minority interest, preferred...), as in the DCF. Default 0. */
  otherAdjustments?: number;
  eps?: number;
  ebitda?: number;
  ebit?: number;
  revenue?: number;
  fcf?: number;
  bookValue?: number;
};

export type MultipleName = "pe" | "evEbitda" | "evEbit" | "evSales" | "pFcf" | "pb";
type MetricKey = "eps" | "ebitda" | "ebit" | "revenue" | "fcf" | "bookValue";

export type MultipleDef = { name: MultipleName; label: string; kind: "equity" | "enterprise"; metric: MetricKey };

export const MULTIPLES: Record<MultipleName, MultipleDef> = {
  pe: { name: "pe", label: "P/E", kind: "equity", metric: "eps" },
  evEbitda: { name: "evEbitda", label: "EV/EBITDA", kind: "enterprise", metric: "ebitda" },
  evEbit: { name: "evEbit", label: "EV/EBIT", kind: "enterprise", metric: "ebit" },
  evSales: { name: "evSales", label: "EV/Sales", kind: "enterprise", metric: "revenue" },
  pFcf: { name: "pFcf", label: "P/FCF", kind: "equity", metric: "fcf" },
  pb: { name: "pb", label: "P/B", kind: "equity", metric: "bookValue" },
};

export type MultipleResult = { ok: true; value: number } | { ok: false; reason: string };

export function marketCap(c: CompanyMetrics): number | null {
  if (!isFiniteNumber(c.price) || !isFiniteNumber(c.shares) || c.price <= 0 || c.shares <= 0) return null;
  return c.price * c.shares;
}

export function enterpriseValue(c: CompanyMetrics): number | null {
  const cap = marketCap(c);
  const other = c.otherAdjustments ?? 0;
  if (cap === null || !isFiniteNumber(c.netDebt) || !isFiniteNumber(other)) return null;
  return cap + c.netDebt + other;
}

/**
 * One company's multiple. Not meaningful (ok: false with a reason) when the metric is missing or <= 0,
 * price / shares are invalid, or (for EV multiples) EV <= 0.
 */
export function computeMultiple(c: CompanyMetrics, name: MultipleName): MultipleResult {
  const def = MULTIPLES[name];
  if (!def) return { ok: false, reason: `Unknown multiple "${name}".` };
  const metric = c[def.metric];
  if (!isFiniteNumber(metric)) return { ok: false, reason: `${def.metric} is unavailable.` };
  if (metric <= 0) return { ok: false, reason: `${def.metric} is zero or negative, so ${def.label} is not meaningful.` };
  if (name === "pe") {
    if (!isFiniteNumber(c.price) || c.price <= 0) return { ok: false, reason: "price is unavailable." };
    return { ok: true, value: c.price / metric };
  }
  if (def.kind === "equity") {
    const cap = marketCap(c);
    return cap === null ? { ok: false, reason: "price or shares are unavailable." } : { ok: true, value: cap / metric };
  }
  const ev = enterpriseValue(c);
  if (ev === null) return { ok: false, reason: "price, shares, net debt or other adjustments are unavailable." };
  if (ev <= 0) return { ok: false, reason: `EV is zero or negative, so ${def.label} is not meaningful.` };
  return { ok: true, value: ev / metric };
}

export type PeerStats =
  | { ok: true; median: number; mean: number; min: number; max: number; n: number; excluded: number; excludedSymbols: string[] }
  | { ok: false; reason: string; n: 0; excluded: number; excludedSymbols: string[] };

function median(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Median / mean / min / max of a multiple across peers, over finite positive multiples only. Peers whose
 * multiple is not meaningful (negative or zero metric, negative EV, missing data) are excluded and counted.
 */
export function peerStats(peers: CompanyMetrics[], name: MultipleName): PeerStats {
  const values: number[] = [];
  const excludedSymbols: string[] = [];
  (peers ?? []).forEach((p, i) => {
    const m = computeMultiple(p, name);
    if (m.ok && m.value > 0 && Number.isFinite(m.value)) values.push(m.value);
    else excludedSymbols.push(p.symbol ?? `#${i + 1}`);
  });
  const excluded = excludedSymbols.length;
  if (values.length === 0) {
    return { ok: false, reason: `No peer has a meaningful ${MULTIPLES[name]?.label ?? name}.`, n: 0, excluded, excludedSymbols };
  }
  const sorted = [...values].sort((a, b) => a - b);
  return {
    ok: true,
    median: median(sorted),
    mean: values.reduce((s, v) => s + v, 0) / values.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    n: values.length,
    excluded,
    excludedSymbols,
  };
}

export type ImpliedPrice =
  | { ok: true; price: number; equityValue: number; enterpriseValue: number | null; warnings: string[] }
  | { ok: false; reason: string };

/**
 * Price per share implied by applying `multipleValue` to the target's own metric.
 * Equity multiples: equity = multiple * metric (P/E: price = multiple * eps directly).
 * EV multiples: EV = multiple * metric, equity = EV - netDebt - otherAdjustments, price = equity / shares.
 * ok: false when the target metric is missing or <= 0, or the multiple / shares / net debt are invalid.
 * A negative implied equity (net debt above implied EV) is returned as computed, with a warning.
 */
export function impliedPrice(target: CompanyMetrics, name: MultipleName, multipleValue: number): ImpliedPrice {
  const def = MULTIPLES[name];
  if (!def) return { ok: false, reason: `Unknown multiple "${name}".` };
  if (!isFiniteNumber(multipleValue) || multipleValue <= 0) return { ok: false, reason: "The multiple must be a finite number greater than 0." };
  const metric = target[def.metric];
  if (!isFiniteNumber(metric)) return { ok: false, reason: `${def.metric} is unavailable for the target.` };
  if (metric <= 0) return { ok: false, reason: `The target's ${def.metric} is zero or negative, so ${def.label} cannot value it.` };
  if (!isFiniteNumber(target.shares) || target.shares <= 0) return { ok: false, reason: "shares are unavailable for the target." };

  if (name === "pe") {
    const price = multipleValue * metric;
    return { ok: true, price, equityValue: price * target.shares, enterpriseValue: null, warnings: [] };
  }
  if (def.kind === "equity") {
    const equityValue = multipleValue * metric;
    return { ok: true, price: equityValue / target.shares, equityValue, enterpriseValue: null, warnings: [] };
  }
  if (!isFiniteNumber(target.netDebt)) return { ok: false, reason: "net debt is unavailable for the target." };
  const other = target.otherAdjustments ?? 0;
  if (!isFiniteNumber(other)) return { ok: false, reason: "other adjustments must be a finite number when given." };
  const ev = multipleValue * metric;
  const equityValue = ev - target.netDebt - other;
  const warnings = equityValue <= 0 ? ["Net debt and other claims exceed the implied enterprise value; implied equity is zero or negative."] : [];
  return { ok: true, price: equityValue / target.shares, equityValue, enterpriseValue: ev, warnings };
}
