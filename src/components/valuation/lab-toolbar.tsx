"use client";

import Link from "next/link";
import { useState } from "react";
import type { CompanySnapshot } from "@/lib/company-types";
import { fmtAsOf } from "@/lib/format";
import { Chip, SourceTag } from "@/components/ui/source-tag";
import { actionBtn } from "./field";
import { fmtPerShare } from "./fmt";
import type { LivePrice } from "./workspace";

type LabToolbarProps = {
  snapshot: CompanySnapshot;
  price: LivePrice;
  savedAt: string | null;
  notice: string | null;
  canSave: boolean;
  onSave: () => void;
  onReset: () => void;
  onDelete: () => void;
};

/** Company name, live price with its session, and the save / reset / delete controls. */
export function LabToolbar({ snapshot, price, savedAt, notice, canSave, onSave, onReset, onDelete }: LabToolbarProps) {
  const [confirming, setConfirming] = useState(false);
  return (
    <section className="rounded-2xl border border-line bg-card px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-[12.5px] text-muted">
            <Link href={`/q/${encodeURIComponent(snapshot.symbol)}`} className="num font-semibold text-fg hover:underline">
              {snapshot.symbol}
            </Link>
            {snapshot.exchanges[0] && <span className="text-faint">· {snapshot.exchanges[0]}</span>}
            {snapshot.sicDescription && <span className="text-faint">· {snapshot.sicDescription}</span>}
          </p>
          <h2 className="mt-1 truncate text-[21px] font-semibold tracking-tight">{snapshot.name}</h2>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="num text-[24px] font-semibold leading-none">
              {price.value === null ? "—" : fmtPerShare(price.value, price.currency ?? snapshot.currency)}
            </span>
            {price.provenance?.delayed && <Chip title="CNBC marks this quote as delayed">Delayed</Chip>}
            {price.provenance && <SourceTag provenance={price.provenance} />}
          </div>
          {price.note && <p className="mt-1.5 text-[12.5px] text-muted">{price.note}</p>}
          {snapshot.financialCompany && (
            <p className="mt-1.5 max-w-[70ch] text-[12.5px] text-muted">
              This is a bank or insurer: debt-based figures (net debt, EV) are not meaningful and are left empty. A DCF on free cash flow fits such companies poorly.
            </p>
          )}
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={onSave} disabled={!canSave} className={actionBtn} title={canSave ? undefined : "Complete the inputs to get a valid result first"}>
              Save model
            </button>
            <button type="button" onClick={onReset} className={actionBtn}>
              Reset to sourced inputs
            </button>
            {savedAt && !confirming && (
              <button type="button" onClick={() => setConfirming(true)} className={actionBtn}>
                Delete saved
              </button>
            )}
            {savedAt && confirming && (
              <span className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setConfirming(false);
                    onDelete();
                  }}
                  className={`${actionBtn} border-down text-down`}
                >
                  Confirm delete
                </button>
                <button type="button" onClick={() => setConfirming(false)} className={actionBtn}>
                  Keep
                </button>
              </span>
            )}
          </div>
          <p className="text-[12px] text-faint" aria-live="polite">
            {savedAt ? `Saved on this device ${fmtAsOf(savedAt)}` : "Not saved yet"}
            {notice ? ` · ${notice}` : ""}
          </p>
        </div>
      </div>
      {snapshot.warnings.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-line pt-3 text-[12.5px] text-muted">
          {snapshot.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
