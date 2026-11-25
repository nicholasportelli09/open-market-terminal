"use client";

import { useSyncExternalStore } from "react";
import {
  LocalPortfolioRepository,
  addTransaction,
  createPortfolio,
  createTransaction,
  removeTransaction,
  updateTransaction,
  type LoadStatus,
  type Portfolio,
  type SaveResult,
  type TransactionDraft,
} from "@/lib/portfolio";

/**
 * One shared, on-device portfolio for every screen (portfolio page, analyst, briefing, macro).
 * Data lives in this browser's localStorage only; nothing is sent to a server except the summary
 * a user explicitly includes in an AI request.
 */
type State = { load: LoadStatus | { status: "loading" }; portfolio: Portfolio | null; lastSave: SaveResult | null };

const SERVER_STATE: State = { load: { status: "loading" }, portfolio: null, lastSave: null };

class PortfolioStore {
  private state: State = SERVER_STATE;
  private listeners = new Set<() => void>();
  private repo: LocalPortfolioRepository | null = null;
  private started = false;

  subscribe = (fn: () => void) => {
    this.start();
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  get = () => this.state;
  getServer = () => SERVER_STATE;

  private start() {
    if (this.started || typeof window === "undefined") return;
    this.started = true;
    this.repo = new LocalPortfolioRepository();
    this.reload();
    window.addEventListener("storage", (e) => {
      if (e.key === null || e.key === "terminal.portfolio.v1") this.reload();
    });
  }

  reload() {
    if (!this.repo) return;
    const load = this.repo.loadStatus();
    this.set({ load, portfolio: load.status === "ok" ? load.portfolio : null, lastSave: this.state.lastSave });
  }

  private set(next: State) {
    this.state = next;
    for (const l of this.listeners) l();
  }

  /** Saves and publishes `next`; on failure keeps the previous portfolio and reports why. */
  commit(next: Portfolio): SaveResult {
    if (!this.repo) return { ok: false, reason: "unavailable", message: "Browser storage is not available." };
    const res = this.repo.save(next);
    if (res.ok) this.set({ load: { status: "ok", portfolio: next }, portfolio: next, lastSave: res });
    else this.set({ ...this.state, lastSave: res });
    return res;
  }

  create(name: string, baseCurrency: string): SaveResult {
    return this.commit(createPortfolio(name, baseCurrency));
  }

  add(draft: TransactionDraft): SaveResult {
    const p = this.state.portfolio;
    if (!p) return { ok: false, reason: "invalid", message: "Create a portfolio first." };
    return this.commit(addTransaction(p, createTransaction(draft)));
  }

  update(id: string, changes: Partial<TransactionDraft>): SaveResult {
    const p = this.state.portfolio;
    if (!p) return { ok: false, reason: "invalid", message: "No portfolio loaded." };
    return this.commit(updateTransaction(p, id, changes));
  }

  remove(id: string): SaveResult {
    const p = this.state.portfolio;
    if (!p) return { ok: false, reason: "invalid", message: "No portfolio loaded." };
    return this.commit(removeTransaction(p, id));
  }

  exportJson(): string | null {
    return this.repo && this.state.portfolio ? this.repo.exportJson(this.state.portfolio) : null;
  }

  importJson(text: string): { ok: true } | { ok: false; errors: string[] } {
    if (!this.repo) return { ok: false, errors: ["Browser storage is not available."] };
    const parsed = this.repo.importJson(text);
    if (!parsed.ok) return parsed;
    const res = this.commit(parsed.portfolio);
    return res.ok ? { ok: true } : { ok: false, errors: [res.message] };
  }
}

export const portfolioStore = new PortfolioStore();

export function usePortfolioState(): State {
  return useSyncExternalStore(portfolioStore.subscribe, portfolioStore.get, portfolioStore.getServer);
}
