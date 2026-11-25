"use client";

import type { ReactNode } from "react";
import type { MoneyWeightedReturn, PortfolioValuation, SimpleTotalReturn } from "@/lib/portfolio";
import type { Provenance } from "@/lib/provenance";
import { SourceTags } from "@/components/ui/source-tag";
import { fmtMoney, fmtReturn, fmtSignedMoney, toneClass } from "./money";
import { daySummary, groupFxWarnings, missingLine, mwrView } from "./summary-model";
import { Note, PartialChip } from "./ui-bits";

type Props = {
  valuation: PortfolioValuation;
  returns: { moneyWeighted: MoneyWeightedReturn; simple: SimpleTotalReturn };
  ready: boolean;
  sources: Provenance[];
};

function Stat({ label, children, sub, partial, testId }: { label: string; children: ReactNode; sub?: ReactNode; partial?: string; testId: string }) {
  return (
    <div className="min-w-0 border-b border-line px-4 py-3.5 sm:border-r" data-testid={testId}>
      <dt className="flex items-center gap-1.5 text-[12px] font-medium uppercase tracking-[0.06em] text-faint">
        {label}
        {partial && <PartialChip title={partial} />}
      </dt>
      <dd className="mt-1">
        <div className="num text-[19px] font-semibold leading-tight">{children}</div>
        {sub && <div className="mt-1 text-[12px] leading-snug text-muted">{sub}</div>}
      </dd>
    </div>
  );
}

const IMPLICIT_CONVERSION = /cash treated as converted to [A-Z]{3} for a buy with no fx row/;

const Skeleton = () => <span className="skeleton inline-block h-5 w-28 align-middle" />;
const Pending = () => <span className="text-[15px] font-medium text-faint">—</span>;

export function SummaryPanel({ valuation: v, returns, ready, sources }: Props) {
  const base = v.baseCurrency;
  const t = v.totals;
  const missing = missingLine(v);
  const partial = !t.complete && missing ? `Partial: ${missing}` : undefined;
  const fxPartial = v.missing.fx.length > 0 ? `Partial: no FX rate for ${v.missing.fx.join(", ")}` : undefined;
  const day = daySummary(v);
  const mwr = mwrView(returns.moneyWeighted, missing);
  const show = (node: ReactNode) => (ready ? node : <Skeleton />);
  const unrealizedPct = t.costBasisBase > 0 ? t.unrealizedBase / t.costBasisBase : null;
  const priceEffect = v.positions.reduce((s, p) => s + p.priceEffectBase, 0);
  const fxEffect = v.positions.reduce((s, p) => s + p.fxEffectBase, 0);
  // Implicit conversions are explained under their transaction; the rest stay here.
  const warnings = groupFxWarnings(v.warnings.filter((w) => !IMPLICIT_CONVERSION.test(w)));

  return (
    <section className="rounded-2xl border border-line bg-card" aria-labelledby="summary-heading">
      <header className="flex min-h-12 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-line px-4 py-2.5">
        <h2 id="summary-heading" className="text-[13px] font-semibold uppercase tracking-[0.08em] text-muted">Summary · {base}</h2>
        {ready && <SourceTags list={sources} />}
      </header>
      <dl className="grid grid-cols-1 min-[420px]:grid-cols-2 lg:grid-cols-4 [&>*:last-child]:border-b-0">
        <Stat label="Total value" testId="total-value" partial={ready ? partial : undefined} sub={ready && `Holdings ${fmtMoney(t.marketValueBase, base)} · Cash ${fmtMoney(t.cashBase, base)}`}>
          {show(fmtMoney(t.totalValueBase, base))}
        </Stat>
        <Stat
          label="Day change"
          testId="day-change"
          partial={ready && day && day.withoutPrevClose.length > 0 ? `No previous close for ${day.withoutPrevClose.join(", ")}` : ready ? partial : undefined}
          sub={ready && (day ? <>Holdings since the previous close, at current FX{day.pct !== null && <> · <span className={toneClass(day.pct)}>{fmtReturn(day.pct)}</span></>}</> : "No open holdings")}
        >
          {show(day && day.pct !== null ? <span className={toneClass(day.changeBase)}>{fmtSignedMoney(day.changeBase, base)}</span> : <Pending />)}
        </Stat>
        <Stat
          label="Unrealized P&L"
          testId="unrealized"
          partial={ready ? partial : undefined}
          sub={ready && <>Price {fmtSignedMoney(priceEffect, base)} · FX {fmtSignedMoney(fxEffect, base)}{unrealizedPct !== null && <> · {fmtReturn(unrealizedPct)}</>}</>}
        >
          {show(<span className={toneClass(t.unrealizedBase)}>{fmtSignedMoney(t.unrealizedBase, base)}</span>)}
        </Stat>
        <Stat label="Realized P&L" testId="realized" partial={fxPartial} sub="Closed lots, FIFO, at trade-date FX">
          <span className={toneClass(t.realizedBase)}>{fmtSignedMoney(t.realizedBase, base)}</span>
        </Stat>
        <Stat label="Income" testId="income" partial={fxPartial} sub="Dividends + interest − fees">
          <span className={toneClass(t.incomeBase)}>{fmtSignedMoney(t.incomeBase, base)}</span>
        </Stat>
        <Stat
          label="Total return"
          testId="total-return"
          sub={
            ready &&
            (returns.simple.ok
              ? `${fmtSignedMoney(returns.simple.returnBase, base)} on ${fmtMoney(t.depositsBase, base)} deposited${t.withdrawalsBase > 0 ? `, ${fmtMoney(t.withdrawalsBase, base)} withdrawn` : ""}`
              : returns.simple.reason === "incomplete"
                ? `Incomplete: ${missing || "waiting for prices"}`
                : returns.simple.message)
          }
        >
          {show(returns.simple.ok ? <span className={toneClass(returns.simple.returnPct)}>{fmtReturn(returns.simple.returnPct)}</span> : <Pending />)}
        </Stat>
        <Stat label="Money-weighted" testId="mwr" sub={ready && <><span className="font-medium text-fg">{mwr.label}.</span> {mwr.detail}</>}>
          {show(mwr.ok ? <span className={toneClass(mwr.value)}>{fmtReturn(mwr.value)}</span> : <Pending />)}
        </Stat>
        <Stat label="Net contributions" testId="contributions" partial={fxPartial} sub="Deposits − withdrawals, incl. implicit funding">
          {fmtMoney(t.netContributionsBase, base)}
        </Stat>
      </dl>
      {ready && warnings.length > 0 && (
        <div className="border-t border-line px-4 py-3">
          <Note tone={t.complete ? "muted" : "warn"}>
            <ul className="list-disc space-y-0.5 pl-4">
              {warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </Note>
        </div>
      )}
    </section>
  );
}
