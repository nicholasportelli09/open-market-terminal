/**
 * Ledger: replays transactions in date order (ties broken by createdAt) into lots, cash balances
 * per currency, realized trades, external flows and income. Local currency only; conversion to the
 * base currency happens in valuation.ts, where current FX is known.
 *
 * Cost method: FIFO lots per symbol. A buy opens a lot whose unit cost includes its fees
 * ((quantity * price + fees) / quantity). A sell consumes the oldest lots first; realized P&L =
 * (quantity * price - sell fees) - cost of the consumed lot units.
 *
 * Cash per currency: deposit +amount, withdrawal -amount, buy -(quantity * price + fees),
 * sell +(quantity * price - fees), dividend / interest +amount, fee -amount, fx moves `amount`
 * out of `currency` and `toAmount` into `toCurrency`.
 *
 * Implicit funding: when a buy (or the sold side of an fx conversion) would take that currency's
 * cash below zero, the shortfall is recorded as an implicit deposit on that date, so a user who
 * only enters trades still gets correct contributions and returns. Implicit deposits are reported.
 * A foreign-currency buy is first funded from base-currency cash at its trade-date fxToBase (an
 * implicit conversion, reported), so a base deposit followed by a foreign buy without an fx row
 * does not count the same money twice. Without a trade-date rate it cannot be converted, and
 * `warnings` says that an implicit deposit was made while base cash was available.
 *
 * Invalid transactions (an oversell, a symbol traded in a second currency) are skipped and
 * reported in `issues`; run validatePortfolio to show them to the user before saving.
 */
import { EPSILON, sortTransactions } from "./order";
import type { AssetType, Currency, Portfolio, Transaction } from "./types";

export type Lot = {
  transactionId: string;
  date: string;
  /** Units still open in this lot. */
  quantity: number;
  /** Cost per unit in local currency, buy fees included. */
  unitCost: number;
  /** Units of base per 1 local unit on the buy date; undefined when not entered. */
  fxToBase?: number;
};

export type LotConsumption = { lotTransactionId: string; quantity: number; costLocal: number; fxToBase?: number };

export type RealizedTrade = {
  transactionId: string;
  symbol: string;
  date: string;
  currency: Currency;
  quantity: number;
  /** quantity * price - fees. */
  proceedsLocal: number;
  costLocal: number;
  realizedLocal: number;
  fxToBase?: number;
  lots: LotConsumption[];
};

export type PositionState = {
  symbol: string;
  name?: string;
  assetType: AssetType;
  currency: Currency;
  /** Open quantity; 0 for a fully closed position. */
  quantity: number;
  /** Cost of the open lots in local currency. */
  costLocal: number;
  lots: Lot[];
  realizedLocal: number;
};

export type ExternalFlowKind = "deposit" | "withdrawal" | "implicit_deposit";

export type ExternalFlow = {
  transactionId: string;
  date: string;
  kind: ExternalFlowKind;
  currency: Currency;
  /** Always positive; the kind gives the direction. */
  amount: number;
  fxToBase?: number;
};

export type IncomeEvent = {
  transactionId: string;
  date: string;
  type: "dividend" | "interest" | "fee";
  symbol?: string;
  currency: Currency;
  /** Signed: dividends and interest positive, fees negative. */
  amount: number;
  fxToBase?: number;
};

export type LedgerIssue = { transactionId: string; message: string };

/** Base cash moved into a foreign currency to fund a buy that had no fx row. */
export type ImplicitConversion = {
  transactionId: string;
  date: string;
  fromCurrency: Currency;
  fromAmount: number;
  toCurrency: Currency;
  toAmount: number;
  /** Units of base per 1 unit of toCurrency (the buy's fxToBase). */
  fxToBase: number;
};

export type Ledger = {
  baseCurrency: Currency;
  /** Every symbol ever traded, open and closed, in first-trade order. */
  positions: PositionState[];
  cash: Record<Currency, number>;
  realized: RealizedTrade[];
  externalFlows: ExternalFlow[];
  implicitDeposits: ExternalFlow[];
  implicitConversions: ImplicitConversion[];
  income: IncomeEvent[];
  issues: LedgerIssue[];
  /** Processed but worth showing, e.g. an implicit deposit made while base cash was available. */
  warnings: LedgerIssue[];
  /** Date of the first processed transaction, or null for an empty portfolio. */
  firstDate: string | null;
};

/** The trade-date FX for a transaction: 1 for base-currency transactions, else the entered rate. */
export function historicalFx(currency: Currency, fxToBase: number | undefined, base: Currency): number | undefined {
  return currency === base ? 1 : fxToBase;
}

type MutablePosition = PositionState;

export function buildLedger(portfolio: Portfolio): Ledger {
  const base = portfolio.baseCurrency;
  const positions = new Map<string, MutablePosition>();
  const cash: Record<Currency, number> = {};
  const realized: RealizedTrade[] = [];
  const externalFlows: ExternalFlow[] = [];
  const income: IncomeEvent[] = [];
  const issues: LedgerIssue[] = [];
  const warnings: LedgerIssue[] = [];
  const implicitConversions: ImplicitConversion[] = [];
  let firstDate: string | null = null;

  const addCash = (ccy: Currency, delta: number) => {
    cash[ccy] = (cash[ccy] ?? 0) + delta;
  };
  const flow = (tx: Transaction, kind: ExternalFlowKind, currency: Currency, amount: number, fx: number | undefined) => {
    externalFlows.push({ transactionId: tx.id, date: tx.date, kind, currency, amount, fxToBase: historicalFx(currency, fx, base) });
  };
  /** Covers part of a foreign buy's shortfall from base cash; returns the amount still short. */
  const convertFromBase = (tx: Transaction, ccy: Currency, shortfall: number): number => {
    const baseCash = cash[base] ?? 0;
    if (tx.type !== "buy" || ccy === base || baseCash <= EPSILON) return shortfall;
    const rate = tx.fxToBase;
    if (rate === undefined || !(rate > 0)) {
      warnings.push({
        transactionId: tx.id,
        message: `${tx.symbol ?? "Buy"} on ${tx.date}: ${shortfall.toFixed(2)} ${ccy} counted as a new deposit although ${base} cash was available; add an fx row or the trade-date FX rate`,
      });
      return shortfall;
    }
    const fromAmount = Math.min(baseCash, shortfall * rate);
    const toAmount = fromAmount / rate;
    implicitConversions.push({ transactionId: tx.id, date: tx.date, fromCurrency: base, fromAmount, toCurrency: ccy, toAmount, fxToBase: rate });
    addCash(base, -fromAmount);
    addCash(ccy, toAmount);
    return Math.max(0, shortfall - toAmount);
  };
  /** Takes `cost` out of a currency, funding any new shortfall from base cash, then an implicit deposit. */
  const spend = (tx: Transaction, ccy: Currency, cost: number) => {
    const after = (cash[ccy] ?? 0) - cost;
    if (after < -EPSILON) {
      const shortfall = convertFromBase(tx, ccy, Math.min(cost, -after));
      if (shortfall > EPSILON) {
        flow(tx, "implicit_deposit", ccy, shortfall, tx.fxToBase);
        addCash(ccy, shortfall);
      }
    }
    addCash(ccy, -cost);
  };

  for (const tx of sortTransactions(portfolio.transactions)) {
    firstDate ??= tx.date;
    const fx = historicalFx(tx.currency, tx.fxToBase, base);
    switch (tx.type) {
      case "deposit":
        flow(tx, "deposit", tx.currency, tx.amount ?? 0, tx.fxToBase);
        addCash(tx.currency, tx.amount ?? 0);
        break;
      case "withdrawal":
        flow(tx, "withdrawal", tx.currency, tx.amount ?? 0, tx.fxToBase);
        addCash(tx.currency, -(tx.amount ?? 0));
        break;
      case "dividend":
      case "interest":
      case "fee": {
        const signed = tx.type === "fee" ? -(tx.amount ?? 0) : tx.amount ?? 0;
        income.push({ transactionId: tx.id, date: tx.date, type: tx.type, symbol: tx.symbol, currency: tx.currency, amount: signed, fxToBase: fx });
        addCash(tx.currency, signed);
        break;
      }
      case "fx":
        if (!tx.toCurrency) break;
        spend(tx, tx.currency, tx.amount ?? 0);
        addCash(tx.toCurrency, tx.toAmount ?? 0);
        break;
      case "buy":
      case "sell": {
        const symbol = tx.symbol ?? "";
        const pos = positions.get(symbol);
        if (pos && pos.currency !== tx.currency) {
          issues.push({ transactionId: tx.id, message: `${symbol} is traded in ${pos.currency}; skipped ${tx.type} in ${tx.currency}` });
          break;
        }
        const qty = tx.quantity ?? 0;
        const gross = qty * (tx.price ?? 0);
        const fees = tx.fees ?? 0;
        if (tx.type === "buy") {
          const p = pos ?? newPosition(tx);
          positions.set(symbol, p);
          p.lots.push({ transactionId: tx.id, date: tx.date, quantity: qty, unitCost: (gross + fees) / qty, fxToBase: fx });
          p.quantity += qty;
          p.costLocal += gross + fees;
          if (tx.name) p.name = tx.name;
          if (tx.assetType) p.assetType = tx.assetType;
          spend(tx, tx.currency, gross + fees);
          break;
        }
        if (!pos || qty > pos.quantity + EPSILON) {
          issues.push({ transactionId: tx.id, message: `Sell of ${qty} ${symbol} on ${tx.date} exceeds the ${pos?.quantity ?? 0} held; skipped` });
          break;
        }
        const consumed = consumeFifo(pos, qty);
        const costLocal = consumed.reduce((s, c) => s + c.costLocal, 0);
        const proceedsLocal = gross - fees;
        realized.push({
          transactionId: tx.id,
          symbol,
          date: tx.date,
          currency: tx.currency,
          quantity: qty,
          proceedsLocal,
          costLocal,
          realizedLocal: proceedsLocal - costLocal,
          fxToBase: fx,
          lots: consumed,
        });
        pos.realizedLocal += proceedsLocal - costLocal;
        addCash(tx.currency, proceedsLocal);
        break;
      }
    }
  }

  return {
    baseCurrency: base,
    positions: [...positions.values()].map((p) => ({ ...p, lots: p.lots.map((l) => ({ ...l })) })),
    cash,
    realized,
    externalFlows,
    implicitDeposits: externalFlows.filter((f) => f.kind === "implicit_deposit"),
    implicitConversions,
    income,
    issues,
    warnings,
    firstDate,
  };
}

function newPosition(tx: Transaction): MutablePosition {
  return {
    symbol: tx.symbol ?? "",
    name: tx.name,
    assetType: tx.assetType ?? "stock",
    currency: tx.currency,
    quantity: 0,
    costLocal: 0,
    lots: [],
    realizedLocal: 0,
  };
}

/** Removes `qty` units from the oldest lots of `pos` (mutates the ledger's private state). */
function consumeFifo(pos: MutablePosition, qty: number): LotConsumption[] {
  const consumed: LotConsumption[] = [];
  let remaining = qty;
  while (remaining > EPSILON && pos.lots.length > 0) {
    const lot = pos.lots[0];
    const take = Math.min(lot.quantity, remaining);
    consumed.push({ lotTransactionId: lot.transactionId, quantity: take, costLocal: take * lot.unitCost, fxToBase: lot.fxToBase });
    lot.quantity -= take;
    remaining -= take;
    if (lot.quantity <= EPSILON) pos.lots.shift();
  }
  pos.quantity = Math.max(0, pos.quantity - qty);
  pos.costLocal = pos.lots.reduce((s, l) => s + l.quantity * l.unitCost, 0);
  if (pos.quantity <= EPSILON) pos.quantity = 0;
  return consumed;
}
