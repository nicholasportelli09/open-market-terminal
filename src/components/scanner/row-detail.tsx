"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { SessionMark, SourceTag } from "@/components/ui/source-tag";
import { fmtNumber } from "@/lib/format";
import { quoteHref } from "@/lib/instruments";
import type { Weights } from "@/lib/scanner/factors";
import { sectorOverrideNote } from "@/lib/scanner/sectors";
import type { ThesisResult } from "@/lib/scanner/thesis";
import type { ViewRow } from "@/lib/scanner/view";
import { FactorBreakdown } from "./factor-breakdown";
import { CatalystsList, MetricsList } from "./metrics-list";
import { ThesisPanel } from "./thesis-panel";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Keeps Tab and Shift+Tab cycling inside the dialog (it is aria-modal). */
function trapTab(e: KeyboardEvent, root: HTMLElement | null) {
  if (e.key !== "Tab" || !root) return;
  const items = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement);
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement;
  const inside = active instanceof HTMLElement && root.contains(active);
  if (e.shiftKey && (!inside || active === first)) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && (!inside || active === last)) {
    e.preventDefault();
    first.focus();
  }
}

type RowDetailProps = {
  symbol: string;
  view: ViewRow | null;
  thesis: ThesisResult | null;
  weights: Weights;
  universeSize: number;
  onClose: () => void;
  onThesis: (t: ThesisResult) => void;
};

/** Right-hand drawer (full width on phones) with every metric, its provenance, catalysts and the thesis. */
export function RowDetail({ symbol, view, thesis, weights, universeSize, onClose, onThesis }: RowDetailProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else trapTab(e, dialogRef.current);
    };
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      opener?.focus?.();
    };
  }, [onClose]);

  const row = view?.row ?? null;
  const name = row?.name ?? thesis?.name ?? "";
  return (
    <div className="fixed inset-0 z-50">
      <button type="button" aria-label="Close details" onClick={onClose} className="absolute inset-0 h-full w-full cursor-default bg-black/30" tabIndex={-1} />
      <aside ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="detail-title" className="absolute inset-y-0 right-0 flex w-full max-w-[620px] flex-col border-l border-line bg-card shadow-[0_0_40px_rgba(0,0,0,0.18)]">
        <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <h2 id="detail-title" className="flex flex-wrap items-baseline gap-x-2">
              <span className="num text-[18px] font-semibold">{symbol}</span>
              <span className="truncate text-[14px] text-muted">{name}</span>
            </h2>
            {row && (
              <p className="mt-0.5 text-[12px] text-faint">
                {row.sector}
                {row.sic && ` · SIC ${row.sic}${row.sicDescription ? ` ${row.sicDescription}` : ""}`}
                {row.financialCompany && " · scored as a bank or insurer"}
                {sectorOverrideNote(symbol) && ` · ${sectorOverrideNote(symbol)}`}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Link href={quoteHref(symbol)} className="inline-flex h-8 items-center rounded-lg border border-line px-2.5 text-[12.5px] font-medium text-muted hover:bg-hover hover:text-fg">
              Quote
            </Link>
            <button ref={closeRef} type="button" onClick={onClose} className="inline-flex h-8 cursor-pointer items-center rounded-lg border border-line px-2.5 text-[12.5px] font-medium text-muted hover:bg-hover hover:text-fg">
              Close
            </button>
          </div>
        </header>
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-4 py-4 sm:px-5">
          {row ? (
            <>
              <div>
                <p className="flex flex-wrap items-baseline gap-x-2">
                  <span className="num text-[22px] font-semibold">{fmtNumber(row.price.value, 2)}</span>
                  <span className="text-[12px] text-muted">{row.currency}</span>
                  {row.price.provenance.session && <SessionMark session={row.price.provenance.session} delayed={row.price.provenance.delayed} showLive />}
                </p>
                <SourceTag provenance={row.price.provenance} className="block" />
                <p className="mt-0.5 text-[11.5px] text-faint">Price at screen time; TTM figures to {row.ttmPeriodEnd ?? "n/a"}.</p>
              </div>
              {row.warnings.length > 0 && (
                <ul className="space-y-0.5 rounded-xl border border-line px-3 py-2 text-[12px] text-muted">
                  {row.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              )}
              {view && <FactorBreakdown row={row} scored={view.scored} weights={weights} rank={view.rank} universeSize={universeSize} />}
              <CatalystsList catalysts={row.catalysts} />
            </>
          ) : (
            <p className="text-[12.5px] text-muted">{symbol} is not in the current screen, so only the saved thesis is shown.</p>
          )}
          <ThesisPanel symbol={symbol} thesis={thesis} onGenerated={onThesis} />
          {row && <MetricsList row={row} />}
        </div>
      </aside>
    </div>
  );
}
