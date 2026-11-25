/**
 * IBKR holdings snapshot -> portfolio transactions. Pure.
 *
 * Flex reports give positions and cash as of the last business day, not the full trade history (a query covers
 * at most 365 days), so the import is a snapshot: one buy per open lot at IBKR's cost basis (dated by the lot's
 * open date when the query has lot detail, else the report date), then each currency's ending cash as a deposit
 * (or, when negative, a withdrawal, i.e. a margin loan). Imported rows have ids "ibkr:<n>"; every sync replaces
 * all of them, so the ledger always mirrors the latest report. Hand-entered rows are kept unless the user asks
 * to replace everything.
 */
import { todayIso } from "../order";
import type { AssetType, Portfolio, Transaction } from "../types";
import type { FlexAccount, FlexPosition } from "./ibkr-flex";
import { type IbkrContract, fallbackSymbol } from "./ibkr-symbols";

export const IBKR_ID_PREFIX = "ibkr:";

export type IbkrLot = { date: string | null; quantity: number; unitCost: number };

export type IbkrHolding = {
  symbol: string;
  ibkrSymbol: string;
  exchange: string;
  name: string;
  assetType: AssetType;
  currency: string;
  lots: IbkrLot[];
  /** False when no live quote matched; the holding is imported under a stand-in symbol without a price. */
  live: boolean;
};

export type IbkrAccountSnapshot = {
  id: string;
  /** Masked account number ("U•••4567") or the account's alias. */
  label: string;
  baseCurrency: string | null;
  asOf: string | null;
  holdings: IbkrHolding[];
  cash: { currency: string; amount: number }[];
  /** Plain-language notes: what was skipped and why. */
  notes: string[];
};

export type IbkrSnapshot = { accounts: IbkrAccountSnapshot[]; fetchedAt: string };

export type Resolved = { symbol: string; name?: string } | null;

const IMPORTED: Record<string, true> = { STK: true, FUND: true, CRYPTO: true, ETF: true };
const CATEGORY_NAMES: Record<string, string> = { OPT: "option", FOP: "futures option", FUT: "future", BOND: "bond", WAR: "warrant", CASH: "FX", CFD: "CFD", BILL: "T-bill", IOPT: "structured product" };
const MIN_CASH = 0.005;

export function maskAccount(id: string): string {
  return id.length > 5 ? `${id.slice(0, 1)}•••${id.slice(-4)}` : id;
}

export function contractOf(p: FlexPosition): IbkrContract {
  return { symbol: p.symbol, listingExchange: p.listingExchange, currency: p.currency, assetCategory: p.assetCategory, markPrice: p.markPrice };
}

/** Stable key for one contract across rows (lot rows repeat the contract). */
export function contractKey(p: FlexPosition): string {
  return p.conid || `${p.symbol}@${p.listingExchange}:${p.currency}`;
}

function assetTypeOf(p: FlexPosition): AssetType {
  if (p.assetCategory === "CRYPTO") return "crypto";
  if (p.assetCategory === "FUND") return "fund";
  if (p.assetCategory === "ETF" || p.subCategory === "ETF") return "etf";
  return "stock";
}

function unitCost(p: FlexPosition): number | null {
  const qty = Math.abs(p.quantity);
  const options = [p.costBasisPrice, p.costBasisMoney !== null && qty > 0 ? p.costBasisMoney / qty : null, p.openPrice, p.markPrice];
  return options.find((x): x is number => x !== null && Number.isFinite(x) && x > 0) ?? null;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function holdingsOf(account: FlexAccount, resolve: (p: FlexPosition) => Resolved, notes: string[]): IbkrHolding[] {
  const groups = new Map<string, FlexPosition[]>();
  const skipped = new Map<string, Set<string>>();
  let shorts = 0;
  for (const p of account.positions) {
    if (!IMPORTED[p.assetCategory]) {
      const name = CATEGORY_NAMES[p.assetCategory] ?? (p.assetCategory.toLowerCase() || "other");
      skipped.set(name, new Set([...(skipped.get(name) ?? []), contractKey(p)]));
      continue;
    }
    if (!/^[A-Z]{3}$/.test(p.currency)) continue;
    const key = contractKey(p);
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  const out: IbkrHolding[] = [];
  for (const rows of groups.values()) {
    const lotsRows = rows.filter((r) => r.level === "lot");
    const use = lotsRows.length > 0 ? lotsRows : rows.filter((r) => r.level === "summary");
    const first = use[0];
    if (!first) continue;
    if (use.some((r) => r.quantity < 0)) {
      shorts += 1;
      continue;
    }
    const lots = use.flatMap((r) => {
      const cost = unitCost(r);
      // Summary rows have no open date: snapshotTransactions dates them (first seen, else the report date).
      return cost === null ? [] : [{ date: r.openDate, quantity: Math.abs(r.quantity), unitCost: cost }];
    });
    if (lots.length === 0) {
      notes.push(`${first.symbol}: IBKR gave no cost or price, so it was left out.`);
      continue;
    }
    const contract = contractOf(first);
    const match = resolve(first);
    out.push({
      symbol: match?.symbol ?? fallbackSymbol(contract),
      ibkrSymbol: first.symbol,
      exchange: first.listingExchange,
      name: first.description || match?.name || first.symbol,
      assetType: assetTypeOf(first),
      currency: first.currency,
      lots,
      live: match !== null,
    });
  }
  for (const [name, keys] of skipped) notes.push(`Skipped ${plural(keys.size, `${name} position`)} (not supported yet).`);
  if (shorts > 0) notes.push(`Skipped ${plural(shorts, "short position")} (not supported yet).`);
  const unpriced = out.filter((h) => !h.live).map((h) => `${h.ibkrSymbol} (${h.exchange || "?"})`);
  if (unpriced.length > 0) notes.push(`No live price found for ${unpriced.join(", ")}; imported at cost, but left out of the value until a price is available.`);
  if (!account.hasOpenPositions) notes.push("The Flex Query has no Open Positions section, so no holdings came through.");
  if (!account.hasCashReport) notes.push("The Flex Query has no Cash Report section, so cash was not imported.");
  return out;
}

/**
 * The ledger allows one currency per symbol. When two holdings share a symbol in different currencies (same ticker
 * on two exchanges, or two cut-off stand-in symbols), the later one gets its own stand-in symbol and no live price.
 */
function withUniqueSymbols(accounts: IbkrAccountSnapshot[]): IbkrAccountSnapshot[] {
  const currencyOf = new Map<string, string>();
  return accounts.map((a) => {
    const notes = [...a.notes];
    const holdings = a.holdings.map((h) => {
      const taken = currencyOf.get(h.symbol);
      if (taken === undefined || taken === h.currency) {
        currencyOf.set(h.symbol, h.currency);
        return h;
      }
      let symbol = `${h.symbol.slice(0, 13)}-${h.currency}`;
      for (let n = 2; currencyOf.has(symbol) && currencyOf.get(symbol) !== h.currency; n++) symbol = `${h.symbol.slice(0, 11)}-${h.currency}${n}`;
      currencyOf.set(symbol, h.currency);
      if (h.live) notes.push(`${h.ibkrSymbol} (${h.currency}) shares a symbol with a holding in ${taken}, so it has no live price.`);
      return { ...h, symbol, live: false };
    });
    return { ...a, holdings, notes };
  });
}

/** Holdings and cash per account, with each contract resolved to an app symbol by `resolve`. */
export function buildSnapshot(accounts: FlexAccount[], resolve: (p: FlexPosition) => Resolved, fetchedAt: string): IbkrSnapshot {
  return {
    fetchedAt,
    accounts: withUniqueSymbols(accounts.map((a) => {
      const notes: string[] = [];
      const holdings = holdingsOf(a, resolve, notes);
      const asOf = a.positions.find((p) => p.reportDate)?.reportDate ?? a.toDate;
      return {
        id: a.accountId,
        label: a.alias || maskAccount(a.accountId),
        baseCurrency: a.baseCurrency,
        asOf,
        holdings,
        cash: a.cash.filter((c) => Math.abs(c.endingCash) >= MIN_CASH).map((c) => ({ currency: c.currency, amount: c.endingCash })),
        notes,
      };
    })),
  };
}

export function isIbkrTransaction(t: Pick<Transaction, "id">): boolean {
  return t.id.startsWith(IBKR_ID_PREFIX);
}

const clampDate = (d: string | null, fallback: string, today: string) => {
  const v = d ?? fallback;
  return v > today ? today : v;
};

/**
 * Ledger rows for the chosen accounts. Buys come before cash so the cash rows land exactly on IBKR's balances.
 * A holding without a lot open date keeps the date it was first imported (from `previous`, the portfolio's current
 * rows), so re-syncing never moves a purchase forward; a new one is dated as of the report.
 */
export function snapshotTransactions(snapshot: IbkrSnapshot, accountIds: readonly string[], now: Date = new Date(), previous: readonly Transaction[] = []): Transaction[] {
  const today = todayIso(now);
  const chosen = snapshot.accounts.filter((a) => accountIds.includes(a.id));
  // Earliest earlier IBKR buy per (account note, symbol): its date and createdAt are kept, so a re-sync neither
  // moves the purchase forward nor re-orders it after hand-entered rows of the same day.
  const firstSeen = new Map<string, { date: string; createdAt: string }>();
  for (const t of previous) {
    if (!isIbkrTransaction(t) || t.type !== "buy" || !t.symbol) continue;
    const k = `${t.note ?? ""}|${t.symbol}`;
    const seen = firstSeen.get(k);
    if (!seen || t.date < seen.date || (t.date === seen.date && t.createdAt < seen.createdAt)) firstSeen.set(k, { date: t.date, createdAt: t.createdAt });
  }
  const keepCreated = new Map<number, string>();
  const rows: Omit<Transaction, "id" | "createdAt" | "updatedAt">[] = [];
  for (const a of chosen) {
    const asOf = clampDate(a.asOf, today, today);
    const note = `IBKR ${a.label}`;
    for (const h of a.holdings) {
      for (const lot of h.lots) {
        const seen = lot.date ? undefined : firstSeen.get(`${note}|${h.symbol}`);
        if (seen) keepCreated.set(rows.length, seen.createdAt);
        const date = lot.date ?? seen?.date ?? asOf;
        rows.push({ date: clampDate(date, asOf, today), type: "buy", symbol: h.symbol, name: h.name, assetType: h.assetType, quantity: lot.quantity, price: lot.unitCost, currency: h.currency, fees: 0, note });
      }
    }
  }
  for (const a of chosen) {
    const asOf = clampDate(a.asOf, today, today);
    for (const c of a.cash) {
      rows.push(
        c.amount > 0
          ? { date: asOf, type: "deposit", amount: c.amount, currency: c.currency, note: `IBKR ${a.label} cash` }
          : { date: asOf, type: "withdrawal", amount: -c.amount, currency: c.currency, note: `IBKR ${a.label} margin loan (negative cash)` },
      );
    }
  }
  const t0 = now.getTime();
  return rows.map((r, i) => {
    const ts = new Date(t0 + i).toISOString();
    return { ...r, id: `${IBKR_ID_PREFIX}${i + 1}`, createdAt: keepCreated.get(i) ?? ts, updatedAt: ts };
  });
}

/**
 * Imported rows renamed where a kept hand-entered row already uses the symbol in another currency (the ledger allows
 * one currency per symbol). The renamed holding has no live price, as with any stand-in symbol.
 */
export function avoidSymbolClashes(rows: readonly Transaction[], kept: readonly Transaction[]): Transaction[] {
  const used = new Map<string, string>();
  for (const t of kept) if (t.symbol) used.set(t.symbol, t.currency);
  return rows.map((t) => {
    if (!t.symbol) return t;
    const other = used.get(t.symbol);
    if (other === undefined || other === t.currency) return t;
    let symbol = `${t.symbol.slice(0, 13)}-${t.currency}`;
    for (let n = 2; used.has(symbol) && used.get(symbol) !== t.currency; n++) symbol = `${t.symbol.slice(0, 11)}-${t.currency}${n}`;
    return { ...t, symbol };
  });
}

/**
 * Hand-entered buys and sells of a symbol IBKR also holds, dated on or after that holding's first IBKR buy: IBKR's
 * report already includes trades made there, so these are probably counted twice.
 */
export function likelyDuplicates(p: Portfolio): Transaction[] {
  const firstIbkr = new Map<string, string>();
  for (const t of p.transactions) {
    if (!isIbkrTransaction(t) || t.type !== "buy" || !t.symbol) continue;
    const d = firstIbkr.get(t.symbol);
    if (!d || t.date < d) firstIbkr.set(t.symbol, t.date);
  }
  return p.transactions.filter((t) => {
    if (isIbkrTransaction(t) || (t.type !== "buy" && t.type !== "sell") || !t.symbol) return false;
    const d = firstIbkr.get(t.symbol);
    return d !== undefined && t.date >= d;
  });
}

export type ApplyMode = "keep_manual" | "replace_all";

/** The portfolio with every earlier IBKR row (and, for replace_all, every row) replaced by `rows`. */
export function applyIbkrRows(p: Portfolio, rows: Transaction[], mode: ApplyMode, now: Date = new Date()): Portfolio {
  const keep = mode === "replace_all" ? [] : p.transactions.filter((t) => !isIbkrTransaction(t));
  return { ...p, transactions: [...keep, ...avoidSymbolClashes(rows, keep)], updatedAt: now.toISOString() };
}
