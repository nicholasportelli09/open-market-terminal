/**
 * Pure view helpers for the portfolio screens: provenance lines for valued figures, transaction
 * descriptions, newest-first ordering and the explanatory notes for engine-made implicit funding.
 */
import { IBKR_ID_PREFIX, type AssetType, type PortfolioValuation, type Transaction, type TransactionType } from "@/lib/portfolio";
import type { PriceSession, Provenance } from "@/lib/provenance";
import { fmtMoney, fmtQty, fmtRate } from "./money";
import { TYPE_LABEL } from "./form-model";

const oldest = (stamps: string[]): string => [...stamps].sort()[0] ?? "";

/**
 * One provenance line for every price used and one for every FX rate used: the oldest as-of (so
 * nothing looks fresher than it is), the session when all prices share one, and "Delayed" when any
 * price is delayed.
 */
export function valuationSources(v: PortfolioValuation, delayedSymbols: ReadonlySet<string>): Provenance[] {
  const out: Provenance[] = [];
  // One tag per price feed (CNBC, and Naver for Korean shares).
  for (const source of new Set(v.positions.map((p) => p.price.source))) {
    const group = v.positions.filter((p) => p.price.source === source);
    const sessions = new Set(group.map((p) => p.price.session).filter((s): s is PriceSession => !!s));
    const n = group.length;
    out.push({
      source,
      asOf: oldest(group.map((p) => p.price.asOf)),
      session: sessions.size === 1 ? [...sessions][0] : undefined,
      delayed: group.some((p) => delayedSymbols.has(p.symbol)),
      note: `${n} price${n === 1 ? "" : "s"}${sessions.size > 1 ? ", mixed sessions" : ""}`,
    });
  }
  const fx = [...v.positions.map((p) => p.fx), ...v.cash.map((c) => c.fx)].filter((f): f is NonNullable<typeof f> => !!f);
  if (fx.length > 0) {
    out.push({ source: "cnbc", asOf: oldest(fx.map((f) => f.asOf)), session: "continuous", note: `FX spot to ${v.baseCurrency} via USD` });
  }
  return out;
}

/** Newest first: date, then entry time. */
export function newestFirst(list: readonly Transaction[]): Transaction[] {
  return [...list].sort((a, b) => (a.date === b.date ? b.createdAt.localeCompare(a.createdAt) : b.date.localeCompare(a.date)));
}

/** "Buy 10 AAPL @ 150.00 USD", "Deposit 2,000.00 CHF", "FX 1,000.00 CHF -> 1,120.00 USD". */
export function describeTransaction(t: Transaction): string {
  const label = TYPE_LABEL[t.type];
  if (t.type === "buy" || t.type === "sell") {
    return `${label} ${fmtQty(t.quantity ?? 0)} ${t.symbol ?? ""} @ ${fmtMoney(t.price, t.currency)}${t.fees ? ` + ${fmtMoney(t.fees, t.currency)} fees` : ""}`;
  }
  if (t.type === "fx") return `${label} ${fmtMoney(t.amount, t.currency)} to ${fmtMoney(t.toAmount, t.toCurrency ?? "")}`;
  return `${label}${t.symbol ? ` ${t.symbol}` : ""} ${fmtMoney(t.amount, t.currency)}`;
}

/** Signed cash effect in the transaction currency (fx: the amount sold, negative). */
export function cashEffect(t: Transaction): number {
  const gross = (t.quantity ?? 0) * (t.price ?? 0);
  const fees = t.fees ?? 0;
  const amount = t.amount ?? 0;
  const sign: Record<TransactionType, number> = { buy: -1, sell: 1, deposit: 1, withdrawal: -1, dividend: 1, interest: 1, fee: -1, fx: -1 };
  if (t.type === "buy") return -(gross + fees);
  if (t.type === "sell") return gross - fees;
  return sign[t.type] * amount;
}

/** Engine-made notes per transaction id: implicit deposits, implicit conversions and ledger issues. */
export function transactionNotes(v: PortfolioValuation): Map<string, { tone: "muted" | "error"; text: string }[]> {
  const out = new Map<string, { tone: "muted" | "error"; text: string }[]>();
  const add = (id: string, tone: "muted" | "error", text: string) => out.set(id, [...(out.get(id) ?? []), { tone, text }]);
  for (const d of v.implicitDeposits) {
    // An IBKR import is a snapshot: its buys are funded by design, so the "add a deposit" advice does not apply.
    if (d.transactionId.startsWith(IBKR_ID_PREFIX)) continue;
    add(d.transactionId, "muted", `Cash was short by ${fmtMoney(d.amount, d.currency)}, so the engine counts an implicit deposit of that amount on ${d.date}. It is not a transaction you entered; add a deposit to record the real funding.`);
  }
  for (const c of v.implicitConversions) {
    add(c.transactionId, "muted", `Funded from ${fmtMoney(c.fromAmount, c.fromCurrency)} cash, treated as converted to ${fmtMoney(c.toAmount, c.toCurrency)} at the trade-date rate ${fmtRate(c.fxToBase)}.`);
  }
  for (const i of v.ledgerIssues) add(i.transactionId, "error", `Skipped: ${i.message}`);
  return out;
}

/** Engine asset type from a CNBC search result type ("STOCK", "ETF", "FUND", "CRYPTO", ...). */
export function assetTypeFromSearch(type: string): AssetType {
  const t = type.toUpperCase();
  if (t.includes("ETF")) return "etf";
  if (t.includes("FUND")) return "fund";
  if (t.includes("CRYPTO")) return "crypto";
  if (t.includes("STOCK") || t.includes("EQUITY")) return "stock";
  return "other";
}
