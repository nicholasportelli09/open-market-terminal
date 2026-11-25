"use client";

import { useState } from "react";
import type { ApplyMode, IbkrSnapshot } from "@/lib/portfolio";
import { fmtMoney } from "../money";
import { btn, btnPrimary } from "../ui-bits";

type Props = {
  snapshot: IbkrSnapshot;
  selected: string[];
  /** Hand-entered rows already in the portfolio (asks whether to keep them). */
  manualRows: number;
  onToggle: (id: string) => void;
  onConfirm: (mode: ApplyMode) => void;
  onCancel: () => void;
};

/** Pick the accounts to bring in and whether hand-entered rows stay, before anything is saved. */
export function IbkrReview({ snapshot, selected, manualRows, onToggle, onConfirm, onCancel }: Props) {
  const [mode, setMode] = useState<ApplyMode>("keep_manual");
  return (
    <div className="space-y-3.5">
      <p className="text-[13px] text-muted">Found {snapshot.accounts.length === 1 ? "one account" : `${snapshot.accounts.length} accounts`}. Choose what to bring in.</p>
      <ul className="space-y-2">
        {snapshot.accounts.map((a) => (
          <li key={a.id} className="rounded-xl border border-line bg-surface px-3.5 py-2.5">
            <label className="flex cursor-pointer items-start gap-2.5">
              <input type="checkbox" checked={selected.includes(a.id)} onChange={() => onToggle(a.id)} className="mt-1 h-4 w-4 cursor-pointer accent-current" />
              <span className="min-w-0">
                <span className="block text-[13.5px] font-semibold">{a.label}</span>
                <span className="block text-[12.5px] text-muted">
                  {a.holdings.length} holding{a.holdings.length === 1 ? "" : "s"}
                  {a.cash.length > 0 && ` · cash ${a.cash.map((c) => fmtMoney(c.amount, c.currency)).join(", ")}`}
                  {a.asOf && ` · as of ${a.asOf}`}
                </span>
                {a.notes.length > 0 && (
                  <ul className="mt-1 space-y-0.5 text-[12px] text-faint">
                    {a.notes.map((n, i) => (
                      <li key={i}>{n}</li>
                    ))}
                  </ul>
                )}
              </span>
            </label>
          </li>
        ))}
      </ul>
      {manualRows > 0 && (
        <fieldset className="space-y-1.5">
          <legend className="text-[12.5px] font-medium text-muted">Your portfolio already has {manualRows} entries you typed in.</legend>
          {(
            [
              ["keep_manual", "Keep them and add IBKR alongside"],
              ["replace_all", "Replace them with IBKR (they are deleted)"],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className="flex cursor-pointer items-center gap-2 text-[13px]">
              <input type="radio" name="ibkr-mode" checked={mode === value} onChange={() => setMode(value)} className="h-4 w-4 cursor-pointer accent-current" />
              {label}
            </label>
          ))}
        </fieldset>
      )}
      <p className="text-[12px] text-faint">
        Each holding comes in at IBKR&apos;s cost basis, dated as of the report, and cash at its balance. Syncing again replaces the IBKR rows, so nothing is counted twice.
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={selected.length === 0} onClick={() => onConfirm(manualRows > 0 ? mode : "keep_manual")} className={btnPrimary}>
          Import
        </button>
        <button type="button" onClick={onCancel} className={btn}>
          Cancel
        </button>
      </div>
    </div>
  );
}
