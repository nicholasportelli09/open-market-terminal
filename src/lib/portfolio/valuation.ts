/**
 * Values a portfolio at current prices and FX. Pure: inputs in, numbers out, no network.
 *
 * - Cost in base uses each lot's trade-date fxToBase; where none was entered the current rate is
 *   used and a warning "cost of X converted at current FX" is added.
 * - Unrealized P&L in base splits into a price effect (price change at each lot's historical FX)
 *   and an FX effect (current value at current FX minus current value at historical FX).
 * - Positions without a usable price or FX rate are excluded from totals and listed in `missing`;
 *   they are never valued at cost or at zero. Totals then carry complete = false.
 */
import { buildAllocation } from "./allocation";
import { createFxConverter, type FxConverter } from "./fx";
import { buildLedger, type Ledger, type PositionState } from "./ledger";
import { EPSILON, todayIso } from "./order";
import type { FxMap, Portfolio, PriceMap } from "./types";
import type { BaseFlow, CashValuation, PortfolioValuation, PositionValuation } from "./valuation-types";

export type ValuationOptions = {
  /** Valuation date YYYY-MM-DD; defaults to the device's local date. */
  asOf?: string;
  /** Pass a ledger already built from this portfolio to avoid replaying it twice. */
  ledger?: Ledger;
};

const ratio = (num: number, den: number): number | null => (den > EPSILON ? num / den : null);

type Unweighted = Omit<PositionValuation, "weight">;

function valuePosition(pos: PositionState, prices: PriceMap, fx: FxMap, conv: FxConverter, missingPrices: string[], warnings: string[]): Unweighted | null {
  const quote = prices[pos.symbol];
  if (!quote || !Number.isFinite(quote.price) || quote.price <= 0) {
    missingPrices.push(pos.symbol);
    return null;
  }
  if (quote.currency !== pos.currency) {
    missingPrices.push(pos.symbol);
    warnings.push(`${pos.symbol} price is in ${quote.currency} but was traded in ${pos.currency}; not valued`);
    return null;
  }
  const cur = conv.current(pos.currency);
  if (cur === undefined) return null;

  let costBasisBase = 0;
  let priceEffectBase = 0;
  let fxEffectBase = 0;
  let costAtCurrentFx = false;
  for (const lot of pos.lots) {
    const lotFx = lot.fxToBase ?? cur;
    if (lot.fxToBase === undefined) costAtCurrentFx = true;
    costBasisBase += lot.quantity * lot.unitCost * lotFx;
    priceEffectBase += lot.quantity * (quote.price - lot.unitCost) * lotFx;
    fxEffectBase += lot.quantity * quote.price * (cur - lotFx);
  }
  if (costAtCurrentFx) warnings.push(`cost of ${pos.symbol} converted at current FX`);

  const marketValueLocal = pos.quantity * quote.price;
  const marketValueBase = marketValueLocal * cur;
  const unrealizedBase = marketValueBase - costBasisBase;
  const prev = quote.previousClose;
  return {
    symbol: pos.symbol,
    name: pos.name,
    assetType: pos.assetType,
    currency: pos.currency,
    quantity: pos.quantity,
    avgCost: pos.costLocal / pos.quantity,
    costBasisLocal: pos.costLocal,
    costBasisBase,
    marketValueLocal,
    marketValueBase,
    unrealizedLocal: marketValueLocal - pos.costLocal,
    unrealizedBase,
    unrealizedPct: ratio(unrealizedBase, costBasisBase),
    priceEffectBase,
    fxEffectBase,
    dayChange:
      typeof prev === "number" && Number.isFinite(prev) && prev > 0
        ? {
            previousClose: prev,
            changeLocal: pos.quantity * (quote.price - prev),
            changeBase: pos.quantity * (quote.price - prev) * cur,
            changePct: quote.price / prev - 1,
          }
        : undefined,
    costAtCurrentFx,
    price: quote,
    fx: pos.currency === conv.base ? null : fx[pos.currency] ?? null,
  };
}

/** Realized P&L in base: proceeds at the sell-date FX minus each consumed lot's cost at its buy-date FX. */
function realizedBase(ledger: Ledger, conv: FxConverter): { total: number; complete: boolean } {
  let total = 0;
  let complete = true;
  for (const t of ledger.realized) {
    const sellFx = conv.historical(t.currency, t.fxToBase, `proceeds of ${t.symbol} sold ${t.date} converted at current FX`);
    let cost = 0;
    let ok = sellFx !== undefined;
    for (const c of t.lots) {
      const lotFx = conv.historical(t.currency, c.fxToBase, `cost of ${t.symbol} converted at current FX`);
      if (lotFx === undefined) ok = false;
      else cost += c.costLocal * lotFx;
    }
    if (!ok || sellFx === undefined) {
      complete = false;
      continue;
    }
    total += t.proceedsLocal * sellFx - cost;
  }
  return { total, complete };
}

function incomeBase(ledger: Ledger, conv: FxConverter): { total: number; complete: boolean } {
  let total = 0;
  let complete = true;
  for (const e of ledger.income) {
    const rate = conv.historical(e.currency, e.fxToBase, `${e.type} in ${e.currency} converted at current FX`);
    if (rate === undefined) complete = false;
    else total += e.amount * rate;
  }
  return { total, complete };
}

function baseFlows(ledger: Ledger, conv: FxConverter): { flows: BaseFlow[]; deposits: number; withdrawals: number; complete: boolean } {
  const flows: BaseFlow[] = [];
  let deposits = 0;
  let withdrawals = 0;
  let complete = true;
  for (const f of ledger.externalFlows) {
    const label = f.kind === "withdrawal" ? "withdrawals" : "deposits";
    const rate = conv.historical(f.currency, f.fxToBase, `${label} in ${f.currency} converted at current FX`);
    if (rate === undefined) {
      complete = false;
      continue;
    }
    const amountBase = f.amount * rate;
    if (f.kind === "withdrawal") withdrawals += amountBase;
    else deposits += amountBase;
    flows.push({ date: f.date, amountBase: f.kind === "withdrawal" ? amountBase : -amountBase, kind: f.kind, transactionId: f.transactionId });
  }
  return { flows, deposits, withdrawals, complete };
}

export function valuePortfolio(portfolio: Portfolio, prices: PriceMap, fx: FxMap, options: ValuationOptions = {}): PortfolioValuation {
  const ledger = options.ledger ?? buildLedger(portfolio);
  const conv = createFxConverter(portfolio.baseCurrency, fx);
  const missingPrices: string[] = [];
  const warnings: string[] = [];

  const open = ledger.positions.filter((p) => p.quantity > EPSILON);
  const valued = open
    .map((p) => valuePosition(p, prices, fx, conv, missingPrices, warnings))
    .filter((p): p is Unweighted => p !== null);

  const cash: CashValuation[] = [];
  for (const [currency, amount] of Object.entries(ledger.cash).sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (Math.abs(amount) <= 1e-6) continue;
    const rate = conv.current(currency);
    if (rate === undefined) continue;
    cash.push({ currency, amount, amountBase: amount * rate, fx: currency === conv.base ? null : fx[currency] ?? null });
    if (amount < 0) warnings.push(`${currency} cash is negative (${amount.toFixed(2)}): withdrawals or fees exceed recorded cash`);
  }

  const realized = realizedBase(ledger, conv);
  const income = incomeBase(ledger, conv);
  const contributions = baseFlows(ledger, conv);

  const marketValueBase = valued.reduce((s, p) => s + p.marketValueBase, 0);
  const cashBase = cash.reduce((s, c) => s + c.amountBase, 0);
  const totalValueBase = marketValueBase + cashBase;
  const missingFx = conv.missing();
  const complete =
    missingPrices.length === 0 && missingFx.length === 0 && realized.complete && income.complete && contributions.complete;
  const netContributionsBase = contributions.deposits - contributions.withdrawals;
  const totalReturnBase = complete ? totalValueBase - netContributionsBase : null;

  const positions: PositionValuation[] = valued.map((p) => ({ ...p, weight: ratio(p.marketValueBase, totalValueBase) }));
  const allocation = buildAllocation(positions, cash, totalValueBase);
  if (missingPrices.length > 0) warnings.push(`No usable price for ${missingPrices.join(", ")}: excluded from totals`);
  if (missingFx.length > 0) warnings.push(`No FX rate to ${portfolio.baseCurrency} for ${missingFx.join(", ")}: excluded from totals`);
  for (const issue of [...ledger.issues, ...ledger.warnings]) warnings.push(issue.message);
  for (const c of ledger.implicitConversions) {
    warnings.push(`${c.date}: ${c.fromAmount.toFixed(2)} ${c.fromCurrency} cash treated as converted to ${c.toCurrency} for a buy with no fx row`);
  }

  return {
    baseCurrency: portfolio.baseCurrency,
    asOf: options.asOf ?? todayIso(),
    positions,
    cash,
    totals: {
      marketValueBase,
      cashBase,
      totalValueBase,
      costBasisBase: positions.reduce((s, p) => s + p.costBasisBase, 0),
      unrealizedBase: positions.reduce((s, p) => s + p.unrealizedBase, 0),
      realizedBase: realized.total,
      incomeBase: income.total,
      depositsBase: contributions.deposits,
      withdrawalsBase: contributions.withdrawals,
      netContributionsBase,
      totalReturnBase,
      totalReturnPct: totalReturnBase === null ? null : ratio(totalReturnBase, contributions.deposits),
      complete,
    },
    allocation,
    exposure: {
      grossInvestedPct: ratio(marketValueBase, totalValueBase),
      cashPct: ratio(cashBase, totalValueBase),
      currencyExposure: allocation.byCurrency.map((s) => ({ currency: s.key, valueBase: s.valueBase, pct: s.pct })),
    },
    missing: { prices: missingPrices, fx: missingFx },
    warnings: [...new Set([...warnings, ...conv.warnings()])],
    flows: contributions.flows,
    implicitDeposits: ledger.implicitDeposits,
    implicitConversions: ledger.implicitConversions,
    ledgerIssues: ledger.issues,
  };
}
