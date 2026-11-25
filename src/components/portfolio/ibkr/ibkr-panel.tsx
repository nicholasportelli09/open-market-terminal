"use client";

import { useState } from "react";
import { usePortfolioState } from "@/lib/client/portfolio-store";
import { isIbkrTransaction } from "@/lib/portfolio";
import { Panel } from "@/components/ui/panel";
import { Note, btn, btnSmall } from "../ui-bits";
import { IbkrReview } from "./ibkr-review";
import { IbkrSetup } from "./ibkr-setup";
import { useIbkr } from "./use-ibkr";

function ago(iso: string | null): string {
  if (!iso) return "never";
  const mins = Math.floor((Date.now() - Date.parse(iso)) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.floor(mins / 60);
  return h < 48 ? `${h} h ago` : `${Math.floor(h / 24)} days ago`;
}

/** Interactive Brokers connection: setup, account review, status, sync and disconnect. */
export function IbkrPanel({ variant = "panel" }: { variant?: "panel" | "onboarding" }) {
  const ibkr = useIbkr();
  const { portfolio } = usePortfolioState();
  const [confirmOff, setConfirmOff] = useState(false);
  const { phase, connection } = ibkr;
  const imported = portfolio?.transactions.filter(isIbkrTransaction).length ?? 0;
  const manualRows = (portfolio?.transactions.length ?? 0) - imported;
  const busy = phase.s === "loading";

  const body = (
    <div className="space-y-3">
      {phase.s === "loading" && <p className="text-[13px] text-muted" aria-live="polite">{phase.label}</p>}
      {phase.s === "error" && <Note tone="error">{phase.message}</Note>}
      {phase.s === "done" && (
        <Note>
          <p className="font-medium text-fg">{phase.message}</p>
          {phase.notes.length > 0 && (
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              {phase.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          )}
        </Note>
      )}
      {phase.s === "conflict" && (
        <Note tone="warn">
          <p className="font-medium">{phase.conflicts.length === 1 ? "One entry you typed in" : `${phase.conflicts.length} entries you typed in`} no longer fit your IBKR holdings, so nothing was saved yet.</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {phase.conflicts.map((c) => (
              <li key={c.id}>
                <span className="capitalize">{c.label}</span>: {c.problem}
              </li>
            ))}
          </ul>
          <p className="mt-1.5">IBKR&apos;s report already includes trades made there, so these are often duplicates. Removing them deletes only the rows listed here.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className={btnSmall} onClick={ibkr.resolveConflicts}>
              Remove {phase.conflicts.length === 1 ? "it" : "them"} and import
            </button>
            <button type="button" className={btnSmall} onClick={ibkr.reset}>
              Cancel
            </button>
          </div>
        </Note>
      )}
      {phase.s === "review" ? (
        <IbkrReview snapshot={phase.snapshot} selected={phase.selected} manualRows={manualRows} onToggle={ibkr.toggleAccount} onConfirm={ibkr.confirm} onCancel={ibkr.reset} />
      ) : connection ? (
        <div className="space-y-2.5">
          <p className="text-[13px] text-muted">
            Connected. Last synced {ago(connection.lastSyncAt)}
            {imported > 0 ? ` · ${imported} imported row${imported === 1 ? "" : "s"}` : ""}. Updates by itself when you open this page; trades you make at IBKR arrive with the next sync, so there is no need to enter them here.
          </p>
          {confirmOff ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[12.5px] text-muted">Disconnect and</span>
              <button type="button" className={btnSmall} onClick={() => ibkr.disconnect(false)}>
                keep the holdings
              </button>
              <button type="button" className={btnSmall} onClick={() => ibkr.disconnect(true)}>
                remove them
              </button>
              <button type="button" className={btnSmall} onClick={() => setConfirmOff(false)}>
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button type="button" className={btn} disabled={busy} onClick={() => void ibkr.sync()}>
                Sync now
              </button>
              <button type="button" className={btn} disabled={busy} onClick={() => setConfirmOff(true)}>
                Disconnect
              </button>
            </div>
          )}
        </div>
      ) : (
        <IbkrSetup busy={busy} onConnect={(t, q) => void ibkr.connect(t, q)} onFile={(f) => void ibkr.importFile(f)} />
      )}
    </div>
  );

  if (variant === "onboarding") {
    return (
      <section className="rounded-2xl border border-line bg-card p-5" aria-labelledby="ibkr-heading">
        <h2 id="ibkr-heading" className="text-[15px] font-semibold">Connect Interactive Brokers</h2>
        <p className="mb-4 mt-1 text-[13px] text-muted">Bring in your holdings and cash from every IBKR account, then keep them in sync.</p>
        {body}
      </section>
    );
  }
  return (
    <Panel title="Interactive Brokers" bodyClassName="px-4 py-4">
      {body}
    </Panel>
  );
}
