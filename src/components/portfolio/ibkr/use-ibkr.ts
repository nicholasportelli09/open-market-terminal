"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AUTO_SYNC_AFTER_MS,
  accountsToSync,
  applyIbkrSnapshot,
  fetchIbkrSnapshot,
  forgetIbkrConnection,
  getIbkrConnection,
  type ApplyResult,
  type IbkrConflict,
  removeIbkrRows,
  saveIbkrConnection,
  useIbkrConnection,
} from "@/lib/client/ibkr-connection";
import { portfolioStore } from "@/lib/client/portfolio-store";
import { IBKR_MAX_REQUEST_BYTES, type ApplyMode, type IbkrSnapshot, likelyDuplicates } from "@/lib/portfolio";

export type IbkrPhase =
  | { s: "idle" }
  | { s: "loading"; label: string }
  | { s: "review"; snapshot: IbkrSnapshot; selected: string[]; creds: { token: string; queryId: string } | null }
  | { s: "error"; message: string }
  | {
      s: "conflict";
      snapshot: IbkrSnapshot;
      ids: string[];
      mode: ApplyMode;
      conflicts: IbkrConflict[];
      /** Rows already removed in earlier rounds; every round removes these again plus the new conflicts. */
      dropped: string[];
      creds: { token: string; queryId: string } | null;
      /** A re-sync of the saved connection (not a first import or a file). */
      existing: boolean;
    }
  | { s: "done"; message: string; notes: string[] };

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

function summary(snapshot: IbkrSnapshot, ids: readonly string[]) {
  const chosen = snapshot.accounts.filter((a) => ids.includes(a.id));
  const holdings = chosen.reduce((n, a) => n + a.holdings.length, 0);
  const portfolio = portfolioStore.get().portfolio;
  const dupes = portfolio ? likelyDuplicates(portfolio) : [];
  return {
    message: `Imported ${plural(holdings, "holding")} and cash from ${plural(chosen.length, "IBKR account")}.`,
    notes: [
      ...chosen.flatMap((a) => (chosen.length > 1 ? a.notes.map((n) => `${a.label}: ${n}`) : a.notes)),
      ...dupes.map((t) => `You also entered a ${t.type} of ${t.symbol} on ${t.date}. If you made it at IBKR, delete it: the report already includes it.`),
    ],
  };
}

/** A finished import survives the panel remounting (the first import swaps the onboarding screen for the portfolio). */
let carried: IbkrPhase | null = null;

/** Connect, review, import, re-sync (also automatically when the last sync is old) and disconnect. */
export function useIbkr() {
  const connection = useIbkrConnection();
  const [phase, setPhase] = useState<IbkrPhase>(() => carried ?? { s: "idle" });
  useEffect(() => {
    carried = null;
  }, []);
  const autoTried = useRef(false);

  const connect = useCallback(async (token: string, queryId: string) => {
    setPhase({ s: "loading", label: "Asking IBKR for your report. This takes 5 to 30 seconds..." });
    const creds = { token: token.trim(), queryId: queryId.trim() };
    const r = await fetchIbkrSnapshot(creds);
    if (!r.ok) return setPhase({ s: "error", message: r.message });
    setPhase({ s: "review", snapshot: r.data, selected: r.data.accounts.map((a) => a.id), creds });
  }, []);

  const importFile = useCallback(async (file: File | undefined) => {
    if (!file) return;
    const tooLarge = "The file is too large (4 MB at most). In IBKR, set Open Positions to Summary level detail.";
    if (file.size > IBKR_MAX_REQUEST_BYTES) return setPhase({ s: "error", message: tooLarge });
    const xml = await file.text().catch(() => null);
    if (xml === null) return setPhase({ s: "error", message: "Could not read the file." });
    // JSON escapes every quote in the XML, so check the size that is actually sent.
    if (new Blob([JSON.stringify({ xml })]).size > IBKR_MAX_REQUEST_BYTES) return setPhase({ s: "error", message: tooLarge });
    setPhase({ s: "loading", label: "Reading the file..." });
    const r = await fetchIbkrSnapshot({ xml });
    if (!r.ok) return setPhase({ s: "error", message: r.message });
    setPhase({ s: "review", snapshot: r.data, selected: r.data.accounts.map((a) => a.id), creds: null });
  }, []);

  const toggleAccount = useCallback((id: string) => {
    setPhase((p) => (p.s === "review" ? { ...p, selected: p.selected.includes(id) ? p.selected.filter((x) => x !== id) : [...p.selected, id] } : p));
  }, []);

  /** Saves, or moves to the conflict step; on success remembers the connection (token imports only). */
  const finish = useCallback(
    (res: ApplyResult, snapshot: IbkrSnapshot, ids: string[], mode: ApplyMode, creds: { token: string; queryId: string } | null, existing: boolean, dropped: string[] = []) => {
      if (!res.ok && "conflicts" in res) return setPhase({ s: "conflict", snapshot, ids, mode, conflicts: res.conflicts, dropped, creds, existing });
      if (!res.ok) return setPhase({ s: "error", message: `Nothing was saved: ${res.message}` });
      const c = getIbkrConnection();
      const lastSyncAt = new Date().toISOString();
      // The imported account ids are always saved, so a later report that lacks one cannot erase its holdings.
      if (existing && c) saveIbkrConnection({ ...c, accounts: ids, lastSyncAt });
      else if (creds) saveIbkrConnection({ ...creds, accounts: ids, allAccounts: ids.length === snapshot.accounts.length, lastSyncAt });
      const done: IbkrPhase = { s: "done", ...summary(snapshot, ids) };
      carried = done;
      setPhase(done);
    },
    [],
  );

  const confirm = useCallback(
    (mode: ApplyMode) => {
      if (phase.s !== "review" || phase.selected.length === 0) return;
      finish(applyIbkrSnapshot(phase.snapshot, phase.selected, mode), phase.snapshot, phase.selected, mode, phase.creds, false);
    },
    [phase, finish],
  );

  /** Removes the listed hand-entered rows and saves. */
  const resolveConflicts = useCallback(() => {
    if (phase.s !== "conflict") return;
    const drop = [...new Set([...phase.dropped, ...phase.conflicts.map((c) => c.id)])];
    finish(applyIbkrSnapshot(phase.snapshot, phase.ids, phase.mode, drop), phase.snapshot, phase.ids, phase.mode, phase.creds, phase.existing, drop);
  }, [phase, finish]);

  /** Re-reads the report with the saved connection and replaces the imported rows (hand-entered rows stay). */
  const sync = useCallback(async (quiet = false) => {
    const c = getIbkrConnection();
    if (!c) return;
    setPhase({ s: "loading", label: quiet ? "Updating from IBKR..." : "Syncing with IBKR..." });
    const r = await fetchIbkrSnapshot({ token: c.token, queryId: c.queryId });
    // Disconnected, or another account took over this device, while the report was loading: save nothing.
    if (getIbkrConnection()?.token !== c.token) return setPhase({ s: "idle" });
    if (!r.ok) return setPhase({ s: "error", message: r.message });
    // Saved before account ids were recorded: show the accounts and let the user confirm, as on first connect.
    if (c.accounts.length === 0) {
      return setPhase({ s: "review", snapshot: r.data, selected: r.data.accounts.map((a) => a.id), creds: { token: c.token, queryId: c.queryId } });
    }
    // Never replace an account's holdings with nothing because it is missing from today's report.
    const pick = accountsToSync(c, r.data.accounts.map((a) => a.id));
    if (!pick.ok) {
      const missing = pick.missing;
      return setPhase({
        s: "error",
        message: `Nothing was changed: ${missing.length || "the"} IBKR account${missing.length === 1 ? " you chose is" : "s you chose are"} not in today's report. Check the Flex Query's accounts in IBKR, or disconnect and connect again to choose accounts.`,
      });
    }
    finish(applyIbkrSnapshot(r.data, pick.ids, "keep_manual"), r.data, pick.ids, "keep_manual", null, true);
  }, [finish]);

  useEffect(() => {
    if (autoTried.current || !connection) return;
    autoTried.current = true;
    const last = connection.lastSyncAt ? Date.parse(connection.lastSyncAt) : 0;
    if (Date.now() - last > AUTO_SYNC_AFTER_MS) void sync(true);
  }, [connection, sync]);

  const disconnect = useCallback((removeHoldings: boolean) => {
    forgetIbkrConnection();
    const res = removeHoldings ? removeIbkrRows() : null;
    setPhase(res && !res.ok ? { s: "error", message: res.message } : { s: "idle" });
  }, []);

  const reset = useCallback(() => setPhase({ s: "idle" }), []);

  return { connection, phase, connect, importFile, toggleAccount, confirm, resolveConflicts, sync, disconnect, reset };
}
