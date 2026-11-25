"use client";

/**
 * Browser side of account sync. While signed in it:
 * - pulls the account's rows on start, when the tab regains focus, and every minute while visible;
 * - watches the synced localStorage keys every few seconds and uploads changes shortly after they happen;
 * - after a download, reloads the page so every screen re-reads storage, but only when that cannot interrupt
 *   anything: on the first pass after sign-in or page load, or while the tab is hidden with no AI request
 *   running. Otherwise it sets `pendingReload` and the account menu offers a Reload button.
 * Replaced local data is kept in backups.ts. When another account takes over this device, the previous
 * account's IBKR connection (device-only) is forgotten, so its auto-sync cannot write into the new account. One tab at a time runs a pass (Web Locks when available).
 * Rows are protected by row-level security: a session can only read and write its own user's rows.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { IBKR_STORAGE_KEY } from "@/lib/client/ibkr-connection";
import { requestsInFlight } from "@/lib/client/inflight";
import { addBackup } from "./backups";
import { type RemoteRow, SYNC_KEYS, type SyncKey, type SyncMeta, accountSwitchDone, hashValue, parseMeta, planSync } from "./plan";

const TABLE = "user_data";
const META_KEY = "terminal.sync.meta";
const LOCK_NAME = "terminal-sync";
const RELOAD_FLAG = "terminal.sync.reloadedAt";
const WATCH_MS = 3_000;
const UPLOAD_DELAY_MS = 1_500;
const FOCUS_PULL_MIN_MS = 15_000;
const PERIODIC_PULL_MS = 60_000;
const RELOAD_GUARD_MS = 10_000;
/** Applied to the page directly, so a change to only these never needs a reload. */
const LIVE_KEYS: readonly SyncKey[] = ["terminal.theme", "terminal.calm"];

export type SyncStatus = {
  state: "off" | "syncing" | "synced" | "error";
  at: number | null;
  message: string | null;
  /** Data from another device arrived but the page has not reloaded yet. */
  pendingReload: boolean;
};

const OFF: SyncStatus = { state: "off", at: null, message: null, pendingReload: false };
let status: SyncStatus = OFF;
const listeners = new Set<() => void>();

function setStatus(patch: Partial<SyncStatus>) {
  status = { ...status, ...patch };
  for (const fn of listeners) fn();
}

export const syncStatus = {
  get: (): SyncStatus => status,
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

function getItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function setItem(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function removeItem(key: string): boolean {
  try {
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

function readLocal(): Record<SyncKey, string | null> {
  return Object.fromEntries(SYNC_KEYS.map((k) => [k, getItem(k)])) as Record<SyncKey, string | null>;
}

/** Theme and calm mode take effect without a reload (same attributes the layout's boot script sets). */
function applyLivePrefs() {
  const d = document.documentElement.dataset;
  d.theme = getItem("terminal.theme") === "dark" ? "dark" : "light";
  if (getItem("terminal.calm") === "1") d.calm = "1";
  else delete d.calm;
}

type PassResult = {
  /** Keys whose value on this device a download or stash changed. */
  changedKeys: SyncKey[];
  tooLarge: SyncKey[];
  /** The values this pass treated as in sync; anything different afterwards is a newer local edit. */
  synced: Record<SyncKey, string | null>;
  backupFailed: boolean;
};

/** One full pass: pull, plan, upload, then download and move aside. */
async function syncOnce(sb: SupabaseClient, userId: string, isStopped: () => boolean): Promise<PassResult> {
  const { data, error } = await sb.from(TABLE).select("key,value,updated_at").in("key", [...SYNC_KEYS]);
  if (error) throw new Error(error.message);
  const remote: Partial<Record<SyncKey, RemoteRow>> = {};
  for (const row of data ?? []) {
    if ((SYNC_KEYS as readonly string[]).includes(row.key)) remote[row.key as SyncKey] = { value: row.value, updatedAt: row.updated_at };
  }
  const meta = parseMeta(getItem(META_KEY));
  const local = readLocal();
  const synced = { ...local };
  const plan = planSync(local, remote, meta, userId);
  const next: SyncMeta = { userId, keys: { ...(meta?.userId === userId ? meta.keys : {}) } };
  for (const s of plan.settled) next.keys[s.key] = { hash: s.hash, remoteAt: s.remoteAt };

  // Signed out or switched account while the rows were loading: this device's data may not be this user's.
  if (plan.upload.length > 0 && !isStopped()) {
    const now = new Date().toISOString();
    // user_id is sent explicitly, so row-level security rejects the write if the session changed meanwhile.
    const { data: saved, error: upErr } = await sb
      .from(TABLE)
      .upsert(plan.upload.map((u) => ({ user_id: userId, key: u.key, value: u.value, updated_at: now })), { onConflict: "user_id,key" })
      .select("key,updated_at");
    if (upErr) throw new Error(upErr.message);
    for (const row of saved ?? []) {
      const sent = plan.upload.find((u) => u.key === row.key);
      if (sent) next.keys[sent.key] = { hash: hashValue(sent.value), remoteAt: row.updated_at };
    }
  }

  const changedKeys: SyncKey[] = [];
  let backupFailed = false;
  // Signed out (or switched account) during the pass: record uploads, but do not change this device's data.
  if (!isStopped()) {
    const reason = plan.otherAccount ? "other-account" : "replaced";
    for (const d of plan.download) {
      // An edit made while this pass was waiting on the network wins; the next pass treats it as a conflict.
      if (getItem(d.key) !== local[d.key]) continue;
      if (d.backup !== null && !addBackup(d.key, d.backup, reason)) {
        backupFailed = true;
        continue;
      }
      if (!setItem(d.key, d.value)) continue;
      next.keys[d.key] = { hash: hashValue(d.value), remoteAt: d.remoteAt };
      synced[d.key] = d.value;
      changedKeys.push(d.key);
    }
    for (const s of plan.stash) {
      if (getItem(s.key) !== s.value) continue;
      if (!addBackup(s.key, s.value, "other-account")) {
        backupFailed = true;
        continue;
      }
      if (!removeItem(s.key)) continue;
      synced[s.key] = null;
      changedKeys.push(s.key);
    }
  }
  const switched = !plan.otherAccount || (!isStopped() && accountSwitchDone(plan, getItem));
  if (switched) {
    if (plan.otherAccount) removeItem(IBKR_STORAGE_KEY);
    setItem(META_KEY, JSON.stringify(next));
  }
  return { changedKeys, tooLarge: plan.tooLarge, synced, backupFailed };
}

/** Run one pass with no other tab running one at the same time. */
function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
  return locks ? (locks.request(LOCK_NAME, fn) as Promise<T>) : fn();
}

/** Reload unless one happened moments ago (a guard against loops). Returns false when it did not reload. */
function reloadNow(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_FLAG));
    if (Number.isFinite(last) && Date.now() - last < RELOAD_GUARD_MS) return false;
    sessionStorage.setItem(RELOAD_FLAG, String(Date.now()));
  } catch {
    /* no sessionStorage: reload anyway */
  }
  window.location.reload();
  return true;
}

/**
 * Reload when it cannot interrupt anything; otherwise ask via the account menu. `firstPass`: right after page load
 * or sign-in nothing the user typed or started can be lost yet (a briefing still loading is cached on the server).
 */
function reloadWhenSafe(firstPass: boolean) {
  const safe = firstPass || (requestsInFlight() === 0 && document.visibilityState === "hidden");
  if (safe && reloadNow()) return;
  setStatus({ pendingReload: true });
}

/** User-initiated reload from the account menu. */
export function applyPendingReload() {
  window.location.reload();
}

let stopCurrent: (() => void) | null = null;
let currentUser: string | null = null;

export function stopSync() {
  stopCurrent?.();
  stopCurrent = null;
  currentUser = null;
  status = OFF;
  for (const fn of listeners) fn();
}

export function startSync(sb: SupabaseClient, userId: string) {
  if (currentUser === userId && stopCurrent) return;
  stopSync();
  currentUser = userId;
  let stopped = false;
  let busy = false;
  let again = false;
  let passes = 0;
  let lastPull = 0;
  let uploadTimer: ReturnType<typeof setTimeout> | null = null;
  const seen = new Map<SyncKey, string | null>();
  const isStopped = () => stopped;

  const run = async () => {
    if (stopped) return;
    if (busy) {
      again = true;
      return;
    }
    busy = true;
    setStatus({ state: "syncing" });
    try {
      const r = await exclusive(() => syncOnce(sb, userId, isStopped));
      const first = passes === 0;
      passes++;
      lastPull = Date.now();
      for (const k of SYNC_KEYS) seen.set(k, r.synced[k]);
      if (stopped) return;
      const problems = [
        r.tooLarge.length > 0 ? `too large to sync: ${r.tooLarge.join(", ")}` : null,
        r.backupFailed ? "some changes from another device wait until this device has storage space for a backup" : null,
      ].filter(Boolean);
      setStatus({ state: "synced", at: lastPull, message: problems.length ? problems.join("; ") : null });
      if (r.changedKeys.length === 0) return;
      if (r.changedKeys.every((k) => LIVE_KEYS.includes(k))) applyLivePrefs();
      else reloadWhenSafe(first);
    } catch (err) {
      if (!stopped) setStatus({ state: "error", message: err instanceof Error ? err.message : "Sync failed" });
    } finally {
      busy = false;
      if (again && !stopped) {
        again = false;
        void run();
      }
    }
  };

  const dirty = () => SYNC_KEYS.some((k) => seen.has(k) && seen.get(k) !== getItem(k));
  const tick = () => {
    if (stopped) return;
    if (dirty()) {
      uploadTimer ??= setTimeout(() => {
        uploadTimer = null;
        void run();
      }, UPLOAD_DELAY_MS);
      return;
    }
    if (document.visibilityState === "visible" && Date.now() - lastPull > PERIODIC_PULL_MS) void run();
  };
  const onVisibility = () => {
    if (document.visibilityState === "hidden") {
      if (dirty()) void run();
      if (status.pendingReload) reloadWhenSafe(false);
      return;
    }
    if (Date.now() - lastPull > FOCUS_PULL_MIN_MS) void run();
  };
  const onFocus = () => {
    if (Date.now() - lastPull > FOCUS_PULL_MIN_MS) void run();
  };
  // Another tab changed a synced key (its own edit or a download): this tab's screens hold stale copies.
  const onStorage = (e: StorageEvent) => {
    if (!e.key || !(SYNC_KEYS as readonly string[]).includes(e.key)) return;
    const key = e.key as SyncKey;
    if (e.newValue === seen.get(key)) return;
    seen.set(key, e.newValue);
    if (LIVE_KEYS.includes(key)) applyLivePrefs();
    else reloadWhenSafe(false);
  };

  const interval = setInterval(tick, WATCH_MS);
  window.addEventListener("focus", onFocus);
  window.addEventListener("storage", onStorage);
  document.addEventListener("visibilitychange", onVisibility);
  stopCurrent = () => {
    stopped = true;
    clearInterval(interval);
    if (uploadTimer) clearTimeout(uploadTimer);
    window.removeEventListener("focus", onFocus);
    window.removeEventListener("storage", onStorage);
    document.removeEventListener("visibilitychange", onVisibility);
  };
  void run();
}
