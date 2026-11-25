/**
 * Builds the portfolio summary a user may choose to send with an AI request, from the live valuation.
 * Pure (no React). Matches the strict server validator in src/lib/server/research/portfolio-summary.ts.
 */
import type { PortfolioValuation } from "@/lib/portfolio";
import { MAX_PORTFOLIO_CURRENCIES, MAX_PORTFOLIO_POSITIONS, type PortfolioSummary } from "@/lib/server/research/types";

const round2 = (n: number) => Math.round(n * 100) / 100;
/** Engine fractions (0.125) to percent numbers (12.5), two decimals. */
const pct = (f: number | null) => (f === null || !Number.isFinite(f) ? null : round2(f * 100));

export function buildPortfolioSummary(v: PortfolioValuation): PortfolioSummary {
  const positions = [...v.positions]
    .filter((p) => p.quantity !== 0)
    .sort((a, b) => Math.abs(b.marketValueBase) - Math.abs(a.marketValueBase))
    .slice(0, MAX_PORTFOLIO_POSITIONS)
    .map((p) => ({
      symbol: p.symbol.toUpperCase(),
      currency: p.currency.toUpperCase(),
      value: round2(p.marketValueBase),
      weightPct: pct(p.weight),
      unrealizedPct: pct(p.unrealizedPct),
    }));
  const currencyExposure = [...v.exposure.currencyExposure]
    .sort((a, b) => Math.abs(b.valueBase) - Math.abs(a.valueBase))
    .slice(0, MAX_PORTFOLIO_CURRENCIES)
    .map((c) => ({ currency: c.currency.toUpperCase(), pct: pct(c.pct) }));
  return {
    baseCurrency: v.baseCurrency.toUpperCase(),
    asOf: v.asOf,
    totals: {
      totalValue: round2(v.totals.totalValueBase),
      marketValue: round2(v.totals.marketValueBase),
      cash: round2(v.totals.cashBase),
      unrealized: round2(v.totals.unrealizedBase),
    },
    cashPct: pct(v.exposure.cashPct),
    positions,
    currencyExposure,
    complete: v.totals.complete,
  };
}
