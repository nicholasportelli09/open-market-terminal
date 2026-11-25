/**
 * Pure sync planner: given this device's stored values, the account's rows and what was last synced here, decide
 * per key whether to download, upload or do nothing. No I/O; unit-tested.
 *
 * Rules per key (L = this device, R = account copy, M = last sync record on this device):
 * - only L exists            -> upload
 * - only R exists            -> download
 * - L equals R               -> nothing (record it as synced)
 * - only L changed since M   -> upload
 * - only R changed since M   -> download
 * - both changed (or never synced here and they differ) -> download, keeping L as a local backup
 * When this device was last synced with a DIFFERENT account, its data belongs to that account: nothing is
 * uploaded; data the new account lacks is moved aside (stash) and the account's data is downloaded.
 */

/** Everything the terminal keeps in browser storage that should follow the account. */
export const SYNC_KEYS = [
  "terminal.portfolio.v1",
  "terminal.watchlist.v1",
  "terminal.scanner.v1",
  "terminal.theses.v1",
  "terminal.valuation.v1",
  "terminal.research.v1",
  "terminal.indicators.v1",
  "terminal.theme",
  "terminal.calm",
] as const;
export type SyncKey = (typeof SYNC_KEYS)[number];

/** Matches the database check (value text, at most 1,000,000 characters). */
export const MAX_VALUE_CHARS = 1_000_000;

export type RemoteRow = { value: string; updatedAt: string };
export type KeyRecord = { hash: string; remoteAt: string };
export type SyncMeta = { userId: string; keys: Partial<Record<SyncKey, KeyRecord>> };

export type SyncPlan = {
  download: { key: SyncKey; value: string; remoteAt: string; backup: string | null }[];
  upload: { key: SyncKey; value: string }[];
  /** Keys already equal on both sides whose sync record needs (re)writing. */
  settled: { key: SyncKey; hash: string; remoteAt: string }[];
  /** Keys too large to upload. */
  tooLarge: SyncKey[];
  /** Another account's data on this device that the current account has no copy of: back it up and clear it. */
  stash: { key: SyncKey; value: string }[];
  /** This device was last synced with another account. */
  otherAccount: boolean;
};

/** FNV-1a 32-bit over UTF-16 code units, plus the length: cheap change detection, not security. */
export function hashValue(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `${(h >>> 0).toString(16)}:${s.length}`;
}

function uploadOrFlag(plan: SyncPlan, key: SyncKey, value: string) {
  if (value.length > MAX_VALUE_CHARS) plan.tooLarge.push(key);
  else plan.upload.push({ key, value });
}

export function planSync(
  local: Partial<Record<SyncKey, string | null>>,
  remote: Partial<Record<SyncKey, RemoteRow>>,
  meta: SyncMeta | null,
  userId: string,
): SyncPlan {
  const otherAccount = meta !== null && meta.userId !== userId;
  const records = meta && !otherAccount ? meta.keys : {};
  const plan: SyncPlan = { download: [], upload: [], settled: [], tooLarge: [], stash: [], otherAccount };
  for (const key of SYNC_KEYS) {
    const l = local[key] ?? null;
    const r = remote[key];
    const m = records[key];
    if (l === null) {
      if (r) plan.download.push({ key, value: r.value, remoteAt: r.updatedAt, backup: null });
      continue;
    }
    if (!r) {
      if (otherAccount) plan.stash.push({ key, value: l });
      else uploadOrFlag(plan, key, l);
      continue;
    }
    const hash = hashValue(l);
    if (l === r.value) {
      if (!m || m.remoteAt !== r.updatedAt || m.hash !== hash) plan.settled.push({ key, hash, remoteAt: r.updatedAt });
      continue;
    }
    const localChanged = !m || m.hash !== hash;
    const remoteChanged = !m || m.remoteAt !== r.updatedAt;
    if (localChanged && !remoteChanged) uploadOrFlag(plan, key, l);
    else if (remoteChanged) plan.download.push({ key, value: r.value, remoteAt: r.updatedAt, backup: localChanged ? l : null });
  }
  return plan;
}

/**
 * After an account switch, whether every key of the previous account was moved aside or replaced. Until then the
 * device's data still belongs to the previous account, and recording the new owner would upload it there.
 */
export function accountSwitchDone(plan: SyncPlan, read: (key: SyncKey) => string | null): boolean {
  return plan.stash.every((s) => read(s.key) === null) && plan.download.every((d) => read(d.key) === d.value);
}

export function parseMeta(raw: string | null): SyncMeta | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as unknown;
    if (!v || typeof v !== "object") return null;
    const { userId, keys } = v as { userId?: unknown; keys?: unknown };
    if (typeof userId !== "string" || !keys || typeof keys !== "object") return null;
    const out: SyncMeta["keys"] = {};
    for (const key of SYNC_KEYS) {
      const rec = (keys as Record<string, unknown>)[key] as { hash?: unknown; remoteAt?: unknown } | undefined;
      if (rec && typeof rec.hash === "string" && typeof rec.remoteAt === "string") out[key] = { hash: rec.hash, remoteAt: rec.remoteAt };
    }
    return { userId, keys: out };
  } catch {
    return null;
  }
}
