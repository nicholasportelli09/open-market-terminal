import type { CompanySnapshot, Metric } from "@/lib/company-types";
import type { Provenance } from "@/lib/provenance";

/**
 * Pure seeding of Valuation Lab inputs from a company snapshot (/api/company). Every seed keeps the
 * provenance of the figure it came from; derived seeds link to the SEC filing behind their inputs.
 * Money values are in the snapshot currency (raw units, not millions); shares are a raw count.
 */

export type SeedKey = "baseRevenue" | "sharesDiluted" | "netDebt" | "taxRate" | "salesToCapital";

export type Seed = {
  value: number | null;
  provenance: Provenance;
  /** What the figure is, in plain words. */
  label: string;
  /** Why the value is missing. */
  reason?: string;
};

export type LabSeed = Record<SeedKey, Seed> & {
  fcfMargin: Seed;
  ebitMargin: Seed;
  /** Starting growth for the forecast: 3-year revenue CAGR, else TTM growth. */
  startGrowth: Seed;
  marketCap: Seed;
  totalDebt: Seed;
  fcfTTM: Seed;
  currency: string;
};

/** Provenance of a metric; a derived one borrows the filing link of the first sourced input that has one. */
function provenanceOf(m: Metric, linkFrom: Metric[] = []): Provenance {
  const p = m.provenance;
  if (p.url || p.source !== "model") return p;
  const linked = linkFrom.find((x) => x.provenance.url && x.provenance.source === "sec");
  return linked ? { ...p, url: linked.provenance.url } : p;
}

function fromMetric(m: Metric, label: string, linkFrom: Metric[] = []): Seed {
  const seed: Seed = { value: m.value, provenance: { ...provenanceOf(m, linkFrom), note: shortNote(m) }, label };
  return m.value === null ? { ...seed, reason: m.reason ?? "Not reported" } : seed;
}

/** A compact note: the SEC note for filed figures, the formula for derived ones. */
function shortNote(m: Metric): string | undefined {
  if (m.provenance.source === "model") return m.formula;
  // "FY2026 (10-K), us-gaap:Revenue..." -> "FY2026 (10-K)"; the full concept stays in the formula.
  return m.provenance.note?.split(/, (?:us-gaap|ifrs-full|dei):/)[0];
}

function salesToCapitalSeed(s: CompanySnapshot): Seed {
  const { revenueTTM, equity, netDebt } = s.metrics;
  const label = "Sales to capital (revenue / invested capital)";
  const formula = "Revenue TTM / (equity + net debt)";
  const asOf = s.balanceSheetDate ?? equity.provenance.asOf;
  const provenance: Provenance = { ...provenanceOf(equity, [equity, revenueTTM]), source: "model", asOf, note: formula };
  if (revenueTTM.value === null || equity.value === null || netDebt.value === null) {
    return { value: null, provenance, label, reason: "Revenue, equity or net debt is unavailable" };
  }
  const invested = equity.value + netDebt.value;
  if (!(invested > 0)) return { value: null, provenance, label, reason: "Invested capital is zero or negative" };
  return { value: revenueTTM.value / invested, provenance, label };
}

function startGrowthSeed(s: CompanySnapshot): Seed {
  const { revenueCagr3y, revenueGrowthTTM, revenueTTM } = s.metrics;
  if (revenueCagr3y.value !== null) return fromMetric(revenueCagr3y, "3-year revenue CAGR", [revenueTTM]);
  return fromMetric(revenueGrowthTTM, "Revenue growth, TTM", [revenueTTM]);
}

export function seedFromSnapshot(s: CompanySnapshot): LabSeed {
  const m = s.metrics;
  const balance = [m.totalDebt, m.cash, m.equity];
  return {
    baseRevenue: fromMetric(m.revenueTTM, "Revenue, trailing 12 months"),
    sharesDiluted: fromMetric(m.sharesOutstanding, "Shares outstanding (cover page)"),
    netDebt: fromMetric(m.netDebt, "Net debt (debt minus cash)", balance),
    taxRate: fromMetric(m.effectiveTaxRate, "Effective tax rate, TTM", [m.netIncomeTTM]),
    salesToCapital: salesToCapitalSeed(s),
    fcfMargin: fromMetric(m.fcfMarginTTM, "FCF margin, TTM", [m.operatingCashFlowTTM]),
    ebitMargin: fromMetric(m.operatingMarginTTM, "Operating (EBIT) margin, TTM", [m.operatingIncomeTTM]),
    startGrowth: startGrowthSeed(s),
    marketCap: fromMetric(m.marketCap, "Market value of equity", [m.sharesOutstanding]),
    totalDebt: fromMetric(m.totalDebt, "Total debt (book)"),
    fcfTTM: fromMetric(m.fcfTTM, "Free cash flow, TTM", [m.operatingCashFlowTTM]),
    currency: s.currency,
  };
}

export type HistoryRow = { fiscalYear: number; periodEnd: string; value: number; growth: number | null; provenance: Provenance };

/** Annual revenue history, oldest first, with year-on-year growth where the prior year is present. */
export function revenueHistoryRows(s: CompanySnapshot): HistoryRow[] {
  const rows = [...s.revenueHistory].sort((a, b) => a.fiscalYear - b.fiscalYear);
  return rows.map((r, i) => {
    const prev = rows[i - 1];
    const growth = prev && prev.fiscalYear === r.fiscalYear - 1 && prev.value > 0 ? r.value / prev.value - 1 : null;
    return { fiscalYear: r.fiscalYear, periodEnd: r.periodEnd, value: r.value, growth, provenance: r.provenance };
  });
}

/** CNBC quote fundamentals arrive as strings ("1.06"); null when absent or not a number. */
export function parseBeta(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number(raw.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}
