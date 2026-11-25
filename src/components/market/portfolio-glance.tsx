"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { fmtMoney, fmtReturn, fmtSignedMoney, toneClass } from "@/components/portfolio/money";
import { daySummary, missingLine } from "@/components/portfolio/summary-model";
import { PartialChip } from "@/components/portfolio/ui-bits";
import { useLiveReady } from "@/components/portfolio/use-live-ready";
import { valuationSources } from "@/components/portfolio/view-model";
import { Panel } from "@/components/ui/panel";
import { SourceTags } from "@/components/ui/source-tag";
import { usePortfolioValuation } from "@/lib/client/use-portfolio";

const Skeleton = () => <span className="skeleton inline-block h-5 w-24 align-middle" />;
const Dash = () => <span className="text-faint">—</span>;

function Stat({ label, value, sub, partial }: { label: string; value: ReactNode; sub?: ReactNode; partial?: string }) {
  return (
    <div className="min-w-0 px-4 py-3">
      <dt className="flex items-center gap-1.5 text-[11.5px] font-medium uppercase tracking-[0.06em] text-faint">
        {label}
        {partial && <PartialChip title={partial} />}
      </dt>
      <dd className="mt-1">
        <div className="num truncate text-[18px] font-semibold leading-tight">{value}</div>
        {sub && <div className="num mt-0.5 truncate text-[12px] text-muted">{sub}</div>}
      </dd>
    </div>
  );
}

const openLink = (
  <Link href="/portfolio" className="text-[12.5px] font-medium text-muted hover:text-fg">
    Open portfolio
  </Link>
);

/**
 * Home-page summary of the saved portfolio: total value, today's change, unrealized P&L and total return.
 * Same valuation engine and live CNBC prices as the Portfolio page, so the figures match it exactly.
 */
export function PortfolioGlance() {
  const state = usePortfolioValuation();
  const live = useLiveReady(state.quotes);
  const { portfolio, valuation: v, returns, load } = state;

  if (load.status === "loading") {
    return (
      <Panel title="Portfolio" bodyClassName="grid grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Stat key={i} label={"\u00a0"} value={<Skeleton />} />
        ))}
      </Panel>
    );
  }
  if (!portfolio || !v || !returns) {
    return (
      <Panel title="Portfolio" bodyClassName="px-4 py-3.5">
        <p className="text-[13px] text-muted">
          No portfolio yet.{" "}
          <Link href="/portfolio" className="font-medium text-fg underline-offset-2 hover:underline">
            Add your holdings
          </Link>{" "}
          to see its value, today&apos;s change and returns here.
        </p>
      </Panel>
    );
  }

  const base = v.baseCurrency;
  const t = v.totals;
  const hasTrades = portfolio.transactions.some((x) => x.type === "buy" || x.type === "sell");
  const ready = live.ready || !hasTrades;
  const show = (node: ReactNode) => (ready ? node : <Skeleton />);
  const missing = missingLine(v);
  const partial = ready && !t.complete && missing ? `Partial: ${missing}` : undefined;
  const day = daySummary(v);
  const unrealizedPct = t.costBasisBase > 0 ? t.unrealizedBase / t.costBasisBase : null;
  const simple = returns.simple;
  const delayed = new Set(v.positions.filter((p) => state.quotes[p.symbol]?.delayed).map((p) => p.symbol));

  return (
    <Panel title={`Portfolio · ${base}`} action={openLink}>
      <dl className="grid grid-cols-2 divide-line lg:grid-cols-4 lg:divide-x">
        <Stat label="Total value" partial={partial} value={show(fmtMoney(t.totalValueBase, base))} sub={ready && `Cash ${fmtMoney(t.cashBase, base)}`} />
        <Stat
          label="Day change"
          partial={ready && day && day.withoutPrevClose.length > 0 ? `No previous close for ${day.withoutPrevClose.join(", ")}` : undefined}
          value={show(day && day.pct !== null ? <span className={toneClass(day.changeBase)}>{fmtSignedMoney(day.changeBase, base)}</span> : <Dash />)}
          sub={ready && (day ? day.pct !== null && <span className={toneClass(day.pct)}>{fmtReturn(day.pct)}</span> : "No open holdings")}
        />
        <Stat
          label="Unrealized P&L"
          partial={partial}
          value={show(<span className={toneClass(t.unrealizedBase)}>{fmtSignedMoney(t.unrealizedBase, base)}</span>)}
          sub={ready && unrealizedPct !== null && <span className={toneClass(unrealizedPct)}>{fmtReturn(unrealizedPct)}</span>}
        />
        <Stat
          label="Total return"
          value={show(simple.ok ? <span className={toneClass(simple.returnPct)}>{fmtReturn(simple.returnPct)}</span> : <Dash />)}
          sub={ready && (simple.ok ? <span className={toneClass(simple.returnBase)}>{fmtSignedMoney(simple.returnBase, base)}</span> : simple.reason === "incomplete" ? "Waiting for prices" : "Not available yet")}
        />
      </dl>
      {ready && v.positions.length > 0 && (
        <div className="border-t border-line px-4 py-2">
          <SourceTags list={valuationSources(v, delayed)} />
        </div>
      )}
    </Panel>
  );
}
