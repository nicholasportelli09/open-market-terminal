/**
 * Holdings views over the ledger (FIFO lots; see ledger.ts for the method).
 */
import { buildLedger, type Ledger, type PositionState } from "./ledger";
import { EPSILON } from "./order";
import type { Portfolio } from "./types";

/** Positions with a non-zero open quantity. */
export function openPositions(ledger: Ledger): PositionState[] {
  return ledger.positions.filter((p) => p.quantity > EPSILON);
}

/** The ledger as of the end of `date` (YYYY-MM-DD): only transactions on or before it count. */
export function ledgerAsOf(portfolio: Portfolio, date: string): Ledger {
  return buildLedger({ ...portfolio, transactions: portfolio.transactions.filter((t) => t.date <= date) });
}

/** Open quantity per symbol at the end of `date`. */
export function quantitiesAsOf(portfolio: Portfolio, date: string): Record<string, number> {
  return Object.fromEntries(openPositions(ledgerAsOf(portfolio, date)).map((p) => [p.symbol, p.quantity]));
}

/** Every currency the portfolio touches (trades, cash, fx), excluding the base. Use to request FX rates. */
export function currenciesNeeded(portfolio: Portfolio): string[] {
  const set = new Set<string>();
  for (const t of portfolio.transactions) {
    set.add(t.currency);
    if (t.toCurrency) set.add(t.toCurrency);
  }
  set.delete(portfolio.baseCurrency);
  return [...set].sort();
}

/** Symbols with an open position. Use to request prices. */
export function symbolsNeeded(portfolio: Portfolio): string[] {
  return openPositions(buildLedger(portfolio)).map((p) => p.symbol);
}
