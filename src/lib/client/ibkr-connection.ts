"use client";

/**
 * The IBKR connection on this device: Flex token, Query ID, chosen accounts and the last sync time.
 *
 * Kept in this browser's localStorage only (not in the sync key list, so it never reaches the account database).
 * The token can only read Flex reports; it cannot trade or move money. The imported holdings themselves are
 * ordinary portfolio rows and sync like any other.
 */
import { useSyncExternalStore } from "react";
import type { ApiResult } from "@/lib/api-types";
import {
  type ApplyMode,
  type IbkrSnapshot,
  type SaveResult,
  type Transaction,
  applyIbkrRows,
  createPortfolio,
  isIbkrTransaction,
  snapshotTransactions,
  validatePortfolio,
} from "@/lib/portfolio";
import { portfolioStore } from "./portfolio-store";
import { postApi } from "./use-api";

export type IbkrConnection = {
  token: string;
  queryId: string;
  /** Accounts imported at the last confirmed import or sync; each must be in the next report before anything is replaced. */
  accounts: string[];
  /** Also import accounts that first appear in a later report. */
  allAccounts: boolean;
  lastSyncAt: string | null;
};

/** Device-only; the sync engine forgets it when another account takes over this device. */
export const IBKR_STORAGE_KEY = "terminal.ibkr.v1";
const STORAGE_KEY = IBKR_STORAGE_KEY;
/** Flex reports update once per business day; sync on open when the last sync is older than this. */
export const AUTO_SYNC_AFTER_MS = 6 * 60 * 60_000;

const listeners = new Set<() => void>();
let cache: { raw: string | null; value: IbkrConnection | null } = { raw: null, value: null };

function readRaw(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function parse(raw: string | null): IbkrConnection | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<IbkrConnection>;
    if (typeof v.token !== "string" || typeof v.queryId !== "string") return null;
    const accounts = Array.isArray(v.accounts) ? v.accounts.filter((a): a is string => typeof a === "string") : [];
    // Saved before accounts were always listed: null meant every account.
    const allAccounts = v.allAccounts === true || v.accounts === null;
    return { token: v.token, queryId: v.queryId, accounts, allAccounts, lastSyncAt: typeof v.lastSyncAt === "string" ? v.lastSyncAt : null };
  } catch {
    return null;
  }
}

export function getIbkrConnection(): IbkrConnection | null {
  if (typeof window === "undefined") return null;
  const raw = readRaw();
  if (raw !== cache.raw) cache = { raw, value: parse(raw) };
  return cache.value;
}

function emit() {
  for (const l of listeners) l();
}

export function saveIbkrConnection(c: IbkrConnection): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(c));
    emit();
    return true;
  } catch {
    return false;
  }
}

export function forgetIbkrConnection(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing stored.
  }
  emit();
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  const onStorage = (e: StorageEvent) => (e.key === null || e.key === STORAGE_KEY) && fn();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(fn);
    window.removeEventListener("storage", onStorage);
  };
}

export function useIbkrConnection(): IbkrConnection | null {
  return useSyncExternalStore(subscribe, getIbkrConnection, () => null);
}

export type SyncAccounts = { ok: true; ids: string[] } | { ok: false; missing: string[] };

/** The accounts a re-sync replaces. Fails when a saved account is missing from the report (nothing is replaced then). */
export function accountsToSync(c: Pick<IbkrConnection, "accounts" | "allAccounts">, reported: readonly string[]): SyncAccounts {
  // No saved accounts (a connection saved before they were recorded): the caller asks the user to confirm instead.
  if (c.accounts.length === 0) return { ok: false, missing: [] };
  const ids = c.allAccounts ? [...new Set([...c.accounts, ...reported])] : [...c.accounts];
  const missing = ids.filter((id) => !reported.includes(id));
  return missing.length > 0 ? { ok: false, missing } : { ok: true, ids };
}

/** Reads the report live (token + Query ID) or from an uploaded Flex XML file. */
export function fetchIbkrSnapshot(input: { token: string; queryId: string } | { xml: string }): Promise<ApiResult<IbkrSnapshot>> {
  return postApi<IbkrSnapshot>("/api/brokers/ibkr", input);
}

/** A hand-entered row that no longer fits the IBKR holdings (e.g. a sell IBKR's report already reflects). */
export type IbkrConflict = { id: string; label: string; problem: string };

export type ApplyResult = SaveResult | { ok: false; reason: "conflict"; message: string; conflicts: IbkrConflict[] };

const describe = (t: Transaction) =>
  t.symbol ? `${t.type} ${t.quantity ?? ""} ${t.symbol} on ${t.date}`.replace(/\s+/g, " ") : `${t.type} ${t.amount ?? ""} ${t.currency} on ${t.date}`;

/**
 * Writes the chosen accounts into the portfolio (creating one in the first account's base currency when there is
 * none yet). Earlier IBKR rows are always replaced; `mode` says whether hand-entered rows stay. Hand-entered rows
 * in `drop` are removed too. When kept rows would make the result invalid, nothing is saved and they are listed.
 */
export function applyIbkrSnapshot(snapshot: IbkrSnapshot, accountIds: readonly string[], mode: ApplyMode, drop: readonly string[] = []): ApplyResult {
  const current = portfolioStore.get().portfolio;
  const rows = snapshotTransactions(snapshot, accountIds, new Date(), current?.transactions ?? []);
  const base = snapshot.accounts.find((a) => accountIds.includes(a.id))?.baseCurrency ?? "USD";
  const start = current ?? createPortfolio("My portfolio", base);
  const trimmed = { ...start, transactions: start.transactions.filter((t) => !drop.includes(t.id)) };
  const next = applyIbkrRows(trimmed, rows, mode);
  const byId = new Map(next.transactions.map((t) => [t.id, t]));
  const conflicts = validatePortfolio(next).flatMap((i) => {
    const t = i.transactionId ? byId.get(i.transactionId) : undefined;
    return t && !isIbkrTransaction(t) ? [{ id: t.id, label: describe(t), problem: i.message }] : [];
  });
  if (conflicts.length > 0) {
    const unique = [...new Map(conflicts.map((c) => [c.id, c])).values()];
    return { ok: false, reason: "conflict", message: "Some entries you typed in no longer fit your IBKR holdings.", conflicts: unique };
  }
  return portfolioStore.commit(next);
}

/** Removes every imported IBKR row from the portfolio. */
export function removeIbkrRows(): SaveResult | null {
  const current = portfolioStore.get().portfolio;
  return current ? portfolioStore.commit(applyIbkrRows(current, [], "keep_manual")) : null;
}
