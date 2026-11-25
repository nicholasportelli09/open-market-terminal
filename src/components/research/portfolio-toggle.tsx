"use client";

import Link from "next/link";
import { useEffect, useId, useMemo } from "react";
import { usePortfolioValuation } from "@/lib/client/use-portfolio";
import { fmtNumber } from "@/lib/format";
import type { PortfolioSummary } from "@/lib/server/research/types";
import { buildPortfolioSummary } from "./summary";

type Props = {
  on: boolean;
  onToggle: (on: boolean) => void;
  /** Receives the summary to send (null while off, unavailable or still pricing). */
  onSummary: (s: PortfolioSummary | null) => void;
  /** Hide the full preview table (compact drawer); a short line and a details toggle stay. */
  compact?: boolean;
};

const pct = (n: number | null) => (n === null ? "n/a" : `${n.toFixed(2)}%`);

/** "Include my saved portfolio" switch. Shows exactly what would be sent; off by default. */
export function PortfolioToggle({ on, onToggle, onSummary, compact = false }: Props) {
  const id = useId();
  const { load, portfolio, valuation, pricesLoaded } = usePortfolioValuation();
  const hasPositions = !!valuation && valuation.positions.length + valuation.cash.length > 0;
  const built = useMemo(() => (valuation && pricesLoaded && hasPositions ? buildPortfolioSummary(valuation) : null), [valuation, pricesLoaded, hasPositions]);
  // The valuation gets a new identity on every render (live quotes), so key the summary on its content
  // to pass a stable object up; otherwise the parent's setState re-renders us in an endless loop.
  const key = built ? JSON.stringify(built) : "";
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const summary = useMemo(() => built, [key]);

  useEffect(() => onSummary(on ? summary : null), [on, summary, onSummary]);

  let note: React.ReactNode = null;
  if (load.status === "loading") note = "Loading your saved portfolio.";
  else if (load.status === "corrupt") note = `Your saved portfolio could not be read (${load.errors.slice(0, 2).join("; ")}).`;
  else if (load.status === "newer_version" || load.status === "unavailable") note = load.message;
  else if (!portfolio || !hasPositions) note = <>No saved portfolio on this device yet. Add positions on the <Link href="/portfolio" className="underline underline-offset-2 hover:text-fg">Portfolio</Link> page.</>;
  else if (!pricesLoaded) note = "Waiting for live prices before the summary can be built.";
  const disabled = !summary;

  return (
    <div className="rounded-xl border border-line px-3 py-2.5">
      <div className="flex items-start gap-3">
        <button
          id={id}
          type="button"
          role="switch"
          aria-checked={on && !disabled}
          disabled={disabled}
          onClick={() => onToggle(!on)}
          className={`relative mt-0.5 h-5 w-9 shrink-0 cursor-pointer rounded-full border border-line transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${on && !disabled ? "bg-fg" : "bg-line-strong"}`}
        >
          <span aria-hidden className={`absolute left-0 top-0.5 h-3.5 w-3.5 rounded-full shadow transition-transform ${on && !disabled ? "translate-x-[17px] bg-bg" : "translate-x-0.5 bg-card"}`} />
        </button>
        <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer">
          <span className="block text-[13px] font-medium">Include my saved portfolio</span>
          <span className="block text-[12px] text-muted">
            {note ?? "Off by default. When on, only the summary below is sent with this request; nothing else leaves this browser."}
          </span>
        </label>
      </div>
      {on && summary && <SummaryPreview s={summary} compact={compact} />}
    </div>
  );
}

function SummaryPreview({ s, compact }: { s: PortfolioSummary; compact: boolean }) {
  const table = (
    <div className="mt-2 max-h-56 overflow-auto rounded-lg border border-line">
      <table className="w-full text-[12px]">
        <thead className="sticky top-0 bg-card text-left text-faint">
          <tr><th className="px-2 py-1 font-medium">Symbol</th><th className="px-2 py-1 text-right font-medium">Value ({s.baseCurrency})</th><th className="px-2 py-1 text-right font-medium">Weight</th><th className="px-2 py-1 text-right font-medium">Unrealized</th></tr>
        </thead>
        <tbody className="num">
          {s.positions.map((p) => (
            <tr key={p.symbol} className="border-t border-line">
              <td className="px-2 py-1">{p.symbol} <span className="text-faint">{p.currency}</span></td>
              <td className="px-2 py-1 text-right">{fmtNumber(p.value)}</td>
              <td className="px-2 py-1 text-right">{pct(p.weightPct)}</td>
              <td className="px-2 py-1 text-right">{pct(p.unrealizedPct)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  return (
    <div className="mt-2.5 border-t border-line pt-2 text-[12px] text-muted">
      <p className="font-medium text-fg">This is exactly what will be sent</p>
      <p className="num mt-0.5">
        Total {fmtNumber(s.totals.totalValue)} {s.baseCurrency} · invested {fmtNumber(s.totals.marketValue)} · cash {fmtNumber(s.totals.cash)} ({pct(s.cashPct)}) · unrealized {fmtNumber(s.totals.unrealized)} · as of {s.asOf}
      </p>
      <p className="num mt-0.5">Currencies: {s.currencyExposure.map((c) => `${c.currency} ${pct(c.pct)}`).join(", ") || "n/a"}</p>
      {!s.complete && <p className="mt-0.5 text-down">Some prices or FX rates are missing, so totals cover only what could be valued.</p>}
      {compact ? (
        <details className="mt-1">
          <summary className="cursor-pointer text-faint hover:text-fg">{s.positions.length} positions</summary>
          {table}
        </details>
      ) : (
        table
      )}
      <p className="mt-1.5 text-faint">Valued in this browser from your entries with CNBC prices.</p>
    </div>
  );
}
