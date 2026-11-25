/**
 * Immutable helpers for creating and editing a portfolio. Each returns a new object.
 */
import { PORTFOLIO_SCHEMA_VERSION, type Currency, type Portfolio, type Transaction } from "./types";

/** Random id (crypto.randomUUID when available). */
export function newId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createPortfolio(name: string, baseCurrency: Currency, now: Date = new Date()): Portfolio {
  const ts = now.toISOString();
  return { version: PORTFOLIO_SCHEMA_VERSION, id: newId(), name, baseCurrency, transactions: [], createdAt: ts, updatedAt: ts };
}

/** Symbols are matched case-insensitively by storing them upper case ("aapl" and "AAPL" are one position). */
export function normalizeSymbol(symbol: string | undefined): string | undefined {
  return symbol === undefined ? undefined : symbol.trim().toUpperCase();
}

/** The draft with its symbol normalized; leaves a draft without a symbol key unchanged. */
function withNormalizedSymbol<T extends { symbol?: string }>(draft: T): T {
  return draft.symbol === undefined ? draft : { ...draft, symbol: normalizeSymbol(draft.symbol) };
}

export type TransactionDraft = Omit<Transaction, "id" | "createdAt" | "updatedAt">;

/** Stamps a draft with an id and timestamps. Validate it with validateTransaction before adding. */
export function createTransaction(draft: TransactionDraft, now: Date = new Date()): Transaction {
  const ts = now.toISOString();
  return { ...withNormalizedSymbol(draft), id: newId(), createdAt: ts, updatedAt: ts };
}

export function addTransaction(p: Portfolio, tx: Transaction, now: Date = new Date()): Portfolio {
  return { ...p, transactions: [...p.transactions, tx], updatedAt: now.toISOString() };
}

export function updateTransaction(p: Portfolio, id: string, changes: Partial<TransactionDraft>, now: Date = new Date()): Portfolio {
  const ts = now.toISOString();
  return {
    ...p,
    transactions: p.transactions.map((t) => (t.id === id ? { ...t, ...withNormalizedSymbol(changes), id: t.id, createdAt: t.createdAt, updatedAt: ts } : t)),
    updatedAt: ts,
  };
}

export function removeTransaction(p: Portfolio, id: string, now: Date = new Date()): Portfolio {
  return { ...p, transactions: p.transactions.filter((t) => t.id !== id), updatedAt: now.toISOString() };
}
