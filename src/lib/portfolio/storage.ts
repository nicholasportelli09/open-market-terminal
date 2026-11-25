/**
 * On-device portfolio storage.
 *
 * Privacy: the portfolio lives in the browser's localStorage. This module sends nothing anywhere; when the user
 * signs in, src/lib/sync copies the stored value to their own account (row-level security) for other devices.
 * Signed out, clearing site data or switching browsers loses it, so offer "Export" for backups.
 *
 * Robustness: every storage call is wrapped (private mode, disabled storage and quota errors
 * throw). Unreadable data is copied to `terminal.portfolio.corrupt.<timestamp>` before it is
 * cleared, and the load status reports it. Data saved by a newer schema (an older deployment
 * opened after a newer one) is left untouched and never overwritten. Nothing here throws.
 */
import { parsePortfolio, safeJsonParse } from "./parse";
import { PORTFOLIO_SCHEMA_VERSION, type Portfolio } from "./types";
import { validatePortfolio, type PortfolioIssue, type ValidateOptions } from "./validate";

export const STORAGE_KEY = "terminal.portfolio.v1";
export const CORRUPT_KEY_PREFIX = "terminal.portfolio.corrupt.";

export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type ImportResult = { ok: true; portfolio: Portfolio } | { ok: false; errors: string[] };

export type SaveResult = { ok: true } | { ok: false; reason: "unavailable" | "quota" | "invalid" | "newer_version"; message: string };

export type LoadStatus =
  | { status: "empty" }
  | { status: "ok"; portfolio: Portfolio; migratedFrom?: number }
  | { status: "corrupt"; errors: string[]; backupKey: string | null }
  /** Saved by a newer app version: kept as is, and save() refuses to overwrite it. */
  | { status: "newer_version"; version: number; message: string }
  | { status: "unavailable"; message: string };

export interface PortfolioRepository {
  /** The saved portfolio, or null when none is saved or it could not be read (see loadStatus). */
  load(): Portfolio | null;
  loadStatus(): LoadStatus;
  save(portfolio: Portfolio): SaveResult;
  exportJson(portfolio: Portfolio): string;
  importJson(text: string): ImportResult;
}

/**
 * Schema migrations: MIGRATIONS[n] turns a version-n object into version n + 1. Empty while the
 * schema is at version 1; add a step here whenever PORTFOLIO_SCHEMA_VERSION is raised.
 */
export const MIGRATIONS: Record<number, (raw: Record<string, unknown>) => Record<string, unknown>> = {};

/** The schema version of stored text when it is newer than this app's, else null. */
export function newerSchemaVersion(text: string): number | null {
  const json = safeJsonParse(text);
  if (!json.ok || typeof json.value !== "object" || json.value === null) return null;
  const version = (json.value as Record<string, unknown>).version;
  return typeof version === "number" && Number.isInteger(version) && version > PORTFOLIO_SCHEMA_VERSION ? version : null;
}

function newerVersionMessage(version: number): string {
  return `Saved by a newer version of the app (schema ${version}); update the app to open it`;
}

export function migrate(raw: unknown): { ok: true; value: unknown; from?: number } | { ok: false; error: string } {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { ok: false, error: "Not a portfolio object" };
  let obj = raw as Record<string, unknown>;
  const from = obj.version;
  if (typeof from !== "number" || !Number.isInteger(from) || from < 1) return { ok: false, error: "Missing schema version" };
  if (from > PORTFOLIO_SCHEMA_VERSION) {
    return { ok: false, error: newerVersionMessage(from) };
  }
  for (let v = from; v < PORTFOLIO_SCHEMA_VERSION; v++) {
    const step = MIGRATIONS[v];
    if (!step) return { ok: false, error: `No migration from schema ${v}` };
    obj = { ...step(obj), version: v + 1 };
  }
  return from === PORTFOLIO_SCHEMA_VERSION ? { ok: true, value: obj } : { ok: true, value: obj, from };
}

export type DecodeOptions = ValidateOptions & {
  /**
   * Run validatePortfolio (field rules, oversells). On by default (import). Load turns it off so a
   * stored portfolio is never treated as corrupt for a rule issue, e.g. a date that is "in the
   * future" only because the device changed time zone.
   */
  validate?: boolean;
};

function formatIssue(issue: PortfolioIssue): string {
  return issue.transactionId ? `Transaction ${issue.transactionId}: ${issue.message}` : issue.message;
}

/** Parse + migrate (+ validate) untrusted JSON text into a portfolio. Shared by import and load. */
export function decodePortfolio(text: string, options: DecodeOptions = {}): ImportResult & { migratedFrom?: number } {
  const json = safeJsonParse(text);
  if (!json.ok) return { ok: false, errors: [`Not valid JSON: ${json.error}`] };
  const migrated = migrate(json.value);
  if (!migrated.ok) return { ok: false, errors: [migrated.error] };
  const parsed = parsePortfolio(migrated.value);
  if (!parsed.ok) return parsed;
  const issues = options.validate === false ? [] : validatePortfolio(parsed.portfolio, options);
  if (issues.length > 0) {
    return { ok: false, errors: issues.map(formatIssue) };
  }
  return { ok: true, portfolio: parsed.portfolio, migratedFrom: migrated.from };
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : "Storage error";
}

function isQuotaError(e: unknown): boolean {
  return e instanceof Error && (e.name === "QuotaExceededError" || e.name === "NS_ERROR_DOM_QUOTA_REACHED" || /quota/i.test(e.message));
}

/** localStorage, or null when the browser blocks access (access itself can throw). */
export function browserStorage(): StorageLike | null {
  try {
    const s = (globalThis as { localStorage?: StorageLike }).localStorage;
    return s ?? null;
  } catch {
    return null;
  }
}

export class LocalPortfolioRepository implements PortfolioRepository {
  constructor(
    private readonly storage: StorageLike | null = browserStorage(),
    private readonly now: () => Date = () => new Date(),
    private readonly key: string = STORAGE_KEY,
  ) {}

  load(): Portfolio | null {
    const s = this.loadStatus();
    return s.status === "ok" ? s.portfolio : null;
  }

  loadStatus(): LoadStatus {
    if (!this.storage) return { status: "unavailable", message: "Browser storage is not available (private mode or blocked)" };
    let text: string | null;
    try {
      text = this.storage.getItem(this.key);
    } catch (e) {
      return { status: "unavailable", message: errorMessage(e) };
    }
    if (text === null || text === "") return { status: "empty" };
    const newer = newerSchemaVersion(text);
    if (newer !== null) return { status: "newer_version", version: newer, message: newerVersionMessage(newer) };
    const decoded = decodePortfolio(text, { validate: false });
    if (decoded.ok) {
      return decoded.migratedFrom === undefined
        ? { status: "ok", portfolio: decoded.portfolio }
        : { status: "ok", portfolio: decoded.portfolio, migratedFrom: decoded.migratedFrom };
    }
    return { status: "corrupt", errors: decoded.errors, backupKey: this.backupCorrupt(text) };
  }

  /** Copies unreadable data aside, then clears the main key. Keeps it in place if the copy fails. */
  private backupCorrupt(text: string): string | null {
    if (!this.storage) return null;
    const backupKey = `${CORRUPT_KEY_PREFIX}${this.now().toISOString().replace(/[:.]/g, "-")}`;
    try {
      this.storage.setItem(backupKey, text);
    } catch {
      return null;
    }
    try {
      this.storage.removeItem(this.key);
    } catch {
      // The backup exists; leaving the main key only means the next load reports it again.
    }
    return backupKey;
  }

  /** Schema version of the stored data when a newer app wrote it; null when absent or unreadable. */
  private storedNewerVersion(): number | null {
    try {
      const existing = this.storage?.getItem(this.key);
      return existing ? newerSchemaVersion(existing) : null;
    } catch {
      return null;
    }
  }

  save(portfolio: Portfolio): SaveResult {
    if (!this.storage) return { ok: false, reason: "unavailable", message: "Browser storage is not available" };
    const issues = validatePortfolio(portfolio);
    if (issues.length > 0) {
      return { ok: false, reason: "invalid", message: issues.map(formatIssue).join("; ") };
    }
    const newer = this.storedNewerVersion();
    if (newer !== null) return { ok: false, reason: "newer_version", message: newerVersionMessage(newer) };
    try {
      this.storage.setItem(this.key, JSON.stringify(portfolio));
      return { ok: true };
    } catch (e) {
      return isQuotaError(e)
        ? { ok: false, reason: "quota", message: "Browser storage is full; export a backup and remove old data" }
        : { ok: false, reason: "unavailable", message: errorMessage(e) };
    }
  }

  exportJson(portfolio: Portfolio): string {
    return JSON.stringify(portfolio, null, 2);
  }

  importJson(text: string): ImportResult {
    const decoded = decodePortfolio(text);
    return decoded.ok ? { ok: true, portfolio: decoded.portfolio } : { ok: false, errors: decoded.errors };
  }
}
