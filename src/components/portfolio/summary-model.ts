/** Pure derivations for the summary header (what to show, and why a figure is missing). */
import type { MoneyWeightedReturn, PortfolioValuation } from "@/lib/portfolio";

export type DaySummary = {
  changeBase: number;
  /** Change over the holdings' previous-close value; null when that value is not positive. */
  pct: number | null;
  /** Valued holdings without a previous close (not in the figure). */
  withoutPrevClose: string[];
};

/** Today's price move on the valued holdings at current FX (cash and FX moves are not included). */
export function daySummary(v: PortfolioValuation): DaySummary | null {
  if (v.positions.length === 0) return null;
  let change = 0;
  let previous = 0;
  const withoutPrevClose: string[] = [];
  for (const p of v.positions) {
    if (!p.dayChange) {
      withoutPrevClose.push(p.symbol);
      continue;
    }
    change += p.dayChange.changeBase;
    previous += p.marketValueBase - p.dayChange.changeBase;
  }
  if (withoutPrevClose.length === v.positions.length) return { changeBase: 0, pct: null, withoutPrevClose };
  return { changeBase: change, pct: previous > 0 ? change / previous : null, withoutPrevClose };
}

/** Symbols and currencies left out of the totals, as one readable line ("" when complete). */
export function missingLine(v: PortfolioValuation): string {
  const parts: string[] = [];
  if (v.missing.prices.length) parts.push(`no price for ${v.missing.prices.join(", ")}`);
  if (v.missing.fx.length) parts.push(`no FX rate to ${v.baseCurrency} for ${v.missing.fx.join(", ")}`);
  return parts.join("; ");
}

export type MwrView =
  | { ok: true; value: number; label: string; detail: string }
  | { ok: false; label: string; detail: string };

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Headline + explanation for the money-weighted return, following the engine's headline flag. */
export function mwrView(m: MoneyWeightedReturn, missing: string): MwrView {
  if (m.ok) {
    if (m.headline === "annualized") {
      return { ok: true, value: m.annualized, label: "Annualized (XIRR)", detail: `Since ${m.startDate}, ${plural(m.periodDays, "day")}. Cumulative over the period: ${(m.cumulative * 100).toFixed(2)}%.` };
    }
    return {
      ok: true,
      value: m.cumulative,
      label: "Cumulative, not annualized",
      detail: `Since ${m.startDate}, ${plural(m.periodDays, "day")}. Under one year of history, so the rate is not annualized.`,
    };
  }
  switch (m.reason) {
    case "incomplete":
      return { ok: false, label: "Incomplete", detail: `Needs every price and FX rate${missing ? ` (${missing})` : ""}.` };
    case "period_too_short":
      return { ok: false, label: "Period too short", detail: "Your first deposit or trade is dated today; a return needs at least one day of history." };
    case "no_flows":
      return { ok: false, label: "No history yet", detail: "Add a deposit or a trade." };
    default:
      return { ok: false, label: "Not available", detail: m.message };
  }
}

const AT_CURRENT_FX = /^(.+?) (of|in) (\S+) converted at current FX$/;

/** "cost of AAPL converted at current FX" x 5 -> one line naming all five; other warnings unchanged. */
export function groupFxWarnings(warnings: readonly string[]): string[] {
  const groups = new Map<string, string[]>();
  const out: string[] = [];
  for (const w of warnings) {
    const m = AT_CURRENT_FX.exec(w);
    if (!m) {
      out.push(w);
      continue;
    }
    const key = `${m[1]} ${m[2]}`;
    if (!groups.has(key)) out.push(key);
    groups.set(key, [...(groups.get(key) ?? []), m[3]]);
  }
  return out.map((w) => {
    const items = groups.get(w);
    if (!items) return w;
    const text = `${w} ${items.join(", ")} converted at today's FX (no trade-date rate)`;
    return text.charAt(0).toUpperCase() + text.slice(1);
  });
}
