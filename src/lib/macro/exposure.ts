/**
 * "Your portfolio exposure": reads the portfolio engine's valuation (real prices and FX only) and
 * pairs it with macro readings. Mechanics and reference figures only; no forecasts.
 */
import type { PortfolioValuation } from "@/lib/portfolio";
import type { Obs } from "./implications";

/** Reference overnight rate for a currency, from the central bank cards. */
export type PolicyRef = { label: string; value: number; asOf: string };

export type ExposureContext = {
  /**
   * 1-year % change in the USD value of one unit of each currency (USD = 0), from live CNBC
   * history. Only currencies the dashboard tracks are present.
   */
  usdValue1y: Record<string, Obs | undefined>;
  /** Broad trade-weighted dollar, 1-year % change (FRED DTWEXBGS). */
  dollar1y?: Obs;
  policy: Record<string, PolicyRef | undefined>;
  vix?: Obs;
};

export type CurrencyLine = {
  currency: string;
  pct: number;
  valueBase: number;
  /** 1-year % change of this currency against the base currency, when both legs are tracked. */
  vsBase1y: Obs | null;
};

export type ExposureSummary = {
  base: string;
  totalValueBase: number;
  complete: boolean;
  missing: string[];
  currencies: CurrencyLine[];
  cashPct: number | null;
  investedPct: number | null;
  largest: { symbol: string; name?: string; weight: number; valueBase: number } | null;
  cashRate: PolicyRef | null;
  notes: string[];
};

export const CONCENTRATION_WEIGHT = 0.25;
export const ELEVATED_VIX = 20;

/** Change of currency `c` against `base` from each one's USD value change (cross through USD). */
export function crossChange(c: string, base: string, usdValue1y: ExposureContext["usdValue1y"]): Obs | null {
  const a = c === "USD" ? { value: 0, asOf: "" } : usdValue1y[c];
  const b = base === "USD" ? { value: 0, asOf: "" } : usdValue1y[base];
  if (!a || !b) return null;
  const value = ((1 + a.value / 100) / (1 + b.value / 100) - 1) * 100;
  const asOf = [a.asOf, b.asOf].filter(Boolean).sort()[0] ?? "";
  return { value, asOf };
}

function pctText(share: number): string {
  return `${Math.round(share * 100)}%`;
}

function currencyNotes(base: string, lines: CurrencyLine[], ctx: ExposureContext): string[] {
  const notes: string[] = [];
  for (const l of lines) {
    if (l.currency === base || l.pct <= 0) continue;
    notes.push(
      `${pctText(l.pct)} of your portfolio is in ${l.currency}. When ${l.currency} rises against ${base}, these holdings are worth more in ${base}, and less when it falls.`,
    );
  }
  const d = ctx.dollar1y;
  if (!d) return notes;
  const dir = `${d.value >= 0 ? "up" : "down"} ${Math.abs(d.value).toFixed(1)}%`;
  const usd = lines.find((l) => l.currency === "USD");
  const foreign = lines.filter((l) => l.currency !== "USD" && l.pct > 0).reduce((s, l) => s + l.pct, 0);
  if (base !== "USD" && usd && usd.pct > 0) {
    notes.push(`The broad dollar is ${dir} over 1 year (FRED broad dollar index). A stronger dollar raises the ${base} value of your USD share; a weaker one lowers it.`);
  } else if (base === "USD" && foreign > 0) {
    notes.push(`The broad dollar is ${dir} over 1 year (FRED broad dollar index). A stronger dollar lowers the USD value of your non-USD share (${pctText(foreign)}); a weaker one raises it.`);
  }
  return notes;
}

/** Builds the exposure summary; null when there is nothing valued yet. */
export function summarizeExposure(v: PortfolioValuation, ctx: ExposureContext): ExposureSummary | null {
  const total = v.totals.totalValueBase;
  if (!(total > 0)) return null;
  const currencies: CurrencyLine[] = v.exposure.currencyExposure
    .filter((c) => c.pct !== null && Math.abs(c.valueBase) > 0)
    .map((c) => ({ currency: c.currency, pct: c.pct ?? 0, valueBase: c.valueBase, vsBase1y: c.currency === v.baseCurrency ? null : crossChange(c.currency, v.baseCurrency, ctx.usdValue1y) }));
  const top = [...v.positions].filter((p) => p.weight !== null).sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))[0];
  const largest = top ? { symbol: top.symbol, name: top.name, weight: top.weight ?? 0, valueBase: top.marketValueBase } : null;
  const cashRate = ctx.policy[v.baseCurrency] ?? null;

  const notes = currencyNotes(v.baseCurrency, currencies, ctx);
  if (largest && largest.weight >= CONCENTRATION_WEIGHT) {
    const vix = ctx.vix && ctx.vix.value >= ELEVATED_VIX ? ` With the VIX at ${ctx.vix.value.toFixed(1)} (20 or above), options are pricing larger than usual market swings.` : "";
    notes.push(`${largest.symbol} is ${pctText(largest.weight)} of total value (25% or more), so the portfolio moves closely with that one holding.${vix}`);
  }
  if (v.exposure.cashPct !== null && v.exposure.cashPct > 0 && cashRate) {
    notes.push(
      `For reference, the overnight rate for ${v.baseCurrency} is ${cashRate.value.toFixed(2)}% (${cashRate.label}). What your cash actually earns depends on your account.`,
    );
  }
  return {
    base: v.baseCurrency,
    totalValueBase: total,
    complete: v.totals.complete,
    missing: [...v.missing.prices, ...v.missing.fx.map((c) => `${c} rate`)],
    currencies,
    cashPct: v.exposure.cashPct,
    investedPct: v.exposure.grossInvestedPct,
    largest,
    cashRate,
    notes,
  };
}
