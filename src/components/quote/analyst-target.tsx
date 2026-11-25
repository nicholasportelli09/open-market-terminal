"use client";

import Link from "next/link";
import { impliedUpside, RATING_KEYS, type AnalystData, type AnalystTargets } from "@/lib/analyst-types";
import { useApi } from "@/lib/client/use-api";
import { fmtPct, fmtPrice } from "@/lib/format";
import type { Provenance } from "@/lib/provenance";
import { Panel } from "@/components/ui/panel";
import { SourceTags } from "@/components/ui/source-tag";
import { EmptyState, ErrorState, LoadingBlock, UnavailableState } from "@/components/ui/states";
import { providerName } from "@/components/forecast/forecast-summary";
import { RATING_BG, ratingTone } from "@/components/forecast/section-state";

function Range({ t, last, decimals }: { t: AnalystTargets; last: number | null; decimals: number }) {
  if (t.low == null || t.high == null || t.average == null) return null;
  const lo = Math.min(t.low, last ?? t.low);
  const hi = Math.max(t.high, last ?? t.high);
  const pos = (v: number) => `${((v - lo) / (hi - lo || 1)) * 100}%`;
  const p = (n: number) => fmtPrice(n, decimals);
  return (
    <div>
      <div className="relative h-1.5 rounded-full bg-hover">
        <div className="absolute inset-y-0 rounded-full bg-line" style={{ left: pos(t.low), right: `calc(100% - ${pos(t.high)})` }} />
        <div className="absolute top-1/2 h-3.5 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-fg" style={{ left: pos(t.average) }} title={`Average ${p(t.average)}`} />
        {last != null && (
          <div className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-muted" style={{ left: pos(last) }} title={`Price ${p(last)}`} />
        )}
      </div>
      <div className="num mt-1.5 flex justify-between text-[11.5px] text-faint">
        <span>Low {p(t.low)}</span>
        <span>High {p(t.high)}</span>
      </div>
    </div>
  );
}

export function AnalystSummaryBody({ data, last, decimals }: { data: AnalystData; last: number | null; decimals: number }) {
  const t = data.targets;
  const c = data.consensus;
  if (!t && !c) {
    const issue = data.issues.find((i) => i.section === "targets" || i.section === "consensus");
    return <EmptyState title={issue ? "Unavailable" : "No analyst coverage"} body={issue?.message} />;
  }
  const upside = impliedUpside(t?.average, last);
  const sources = [c?.provenance, t?.provenance].filter((p): p is Provenance => !!p);
  return (
    <div className="space-y-4 px-4 py-4">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <div className="text-[12px] text-faint">Average 12-month target</div>
          <div className="num text-[22px] font-semibold tracking-tight">{fmtPrice(t?.average, decimals)}</div>
        </div>
        {upside != null && (
          <div className={`num text-right text-[13px] font-medium ${upside >= 0 ? "text-up" : "text-down"}`}>
            {fmtPct(upside, 1)}
            <div className="text-[11.5px] font-normal text-faint">{upside >= 0 ? "upside" : "downside"}</div>
          </div>
        )}
      </div>
      {t && <Range t={t} last={last} decimals={decimals} />}
      {c && c.total > 0 && (
        <div>
          <div className="flex items-baseline justify-between text-[12.5px]">
            <span className={`font-medium ${ratingTone(c.ratingKey)}`}>{c.rating}</span>
            <span className="num text-faint">{c.total} analysts</span>
          </div>
          <div className="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-hover" aria-hidden>
            {RATING_KEYS.map((k) => (c.counts[k] > 0 ? <div key={k} className={RATING_BG[k]} style={{ width: `${(c.counts[k] / c.total) * 100}%` }} /> : null))}
          </div>
        </div>
      )}
      <SourceTags list={sources} />
    </div>
  );
}

/** Licensed analyst consensus summary for the quote page; the full view lives at /q/[symbol]/forecast. */
export function AnalystTarget({ symbol, last, decimals }: { symbol: string; last: number | null; decimals: number }) {
  const state = useApi<AnalystData>(`/api/analyst?symbol=${encodeURIComponent(symbol)}`);
  const href = `/q/${encodeURIComponent(symbol)}/forecast`;
  const provider = providerName(state.data?.targets?.provenance ?? state.data?.consensus?.provenance);
  return (
    <Panel
      title={`Analyst consensus (${provider})`}
      action={<Link href={href} className="text-[12.5px] font-medium text-muted hover:text-fg">Forecast</Link>}
    >
      {state.status === "unavailable" && state.error ? (
        <UnavailableState message="Analyst ratings and targets need a licensed data key." missingEnv={state.error.missingEnv} />
      ) : state.status === "error" && state.error ? (
        <ErrorState message={state.error.message} onRetry={state.reload} />
      ) : state.data ? (
        <AnalystSummaryBody data={state.data} last={last} decimals={decimals} />
      ) : (
        <LoadingBlock rows={3} />
      )}
    </Panel>
  );
}
