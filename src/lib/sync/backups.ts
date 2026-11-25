"use client";

/**
 * Copies of this device's data that sync replaced or moved aside, so nothing is lost silently. Kept on this device
 * only (never synced), newest first, at most MAX_BACKUPS. The account menu lists them with Restore / Dismiss.
 */
import type { SyncKey } from "./plan";

const STORE_KEY = "terminal.sync.backups";
const MAX_BACKUPS = 6;

export type BackupReason = "replaced" | "other-account";
export type Backup = { id: string; key: SyncKey; value: string; at: number; reason: BackupReason };

export const KEY_LABELS: Record<SyncKey, string> = {
  "terminal.portfolio.v1": "Portfolio",
  "terminal.watchlist.v1": "Watchlist",
  "terminal.scanner.v1": "Scanner settings",
  "terminal.theses.v1": "Saved theses",
  "terminal.valuation.v1": "Valuation models",
  "terminal.research.v1": "Research history",
  "terminal.indicators.v1": "Chart indicators",
  "terminal.theme": "Theme",
  "terminal.calm": "Calm mode",
};

export function listBackups(): Backup[] {
  try {
    const v = JSON.parse(localStorage.getItem(STORE_KEY) ?? "[]") as unknown;
    return Array.isArray(v) ? v.filter((b): b is Backup => !!b && typeof b.id === "string" && typeof b.value === "string" && b.key in KEY_LABELS) : [];
  } catch {
    return [];
  }
}

function save(list: Backup[]): boolean {
  // Drop the oldest entries until the list fits in storage.
  for (let n = Math.min(list.length, MAX_BACKUPS); n >= 1; n--) {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(list.slice(0, n)));
      return true;
    } catch {
      /* quota: try fewer */
    }
  }
  return false;
}

/** True when the copy was stored. Callers must not overwrite the original if this fails. */
export function addBackup(key: SyncKey, value: string, reason: BackupReason): boolean {
  const entry: Backup = { id: `${Date.now().toString(36)}-${key}`, key, value, at: Date.now(), reason };
  if (!save([entry, ...listBackups()])) return false;
  return listBackups()[0]?.id === entry.id;
}

export function dismissBackup(id: string) {
  const rest = listBackups().filter((b) => b.id !== id);
  try {
    if (rest.length) localStorage.setItem(STORE_KEY, JSON.stringify(rest));
    else localStorage.removeItem(STORE_KEY);
  } catch {
    /* storage unavailable */
  }
}

/** Puts a backup back as this device's current copy (sync then uploads it) and reloads so every screen shows it. */
export function restoreBackup(id: string) {
  const b = listBackups().find((x) => x.id === id);
  if (!b) return;
  try {
    localStorage.setItem(b.key, b.value);
  } catch {
    return;
  }
  dismissBackup(id);
  window.location.reload();
}
