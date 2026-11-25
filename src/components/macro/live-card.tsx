import Link from "next/link";
import { fmtNumber, fmtPct, fmtSigned } from "@/lib/format";
import { quoteHref } from "@/lib/instruments";
import { liveSeries, liveSpark, precisePairSeries, type LiveSeries } from "@/lib/macro/live";
import type { PeriodChange } from "@/lib/macro/math";
import type { LiveKind } from "@/lib/macro/series";
import { nyParts, quoteProvenance, quoteStamp } from "@/lib/market-session";
import type { Quote } from "@/lib/types";
import { SourceTag } from "@/components/ui/source-tag";
import { CardShell, ChangeRow, SkeletonCard } from "./macro-card";
import { MiniLine } from "./mini-line";
import type { History } from "./use-macro-data";

export type LiveDef = { symbol: string; label: string; detail: string; decimals: number; kind: LiveKind };

function fmtChange(kind: LiveKind, c: PeriodChange | null, decimals: number): string {
  if (!c) return "—";
  return kind === "index" ? `${fmtSigned(c.diff, decimals)} pts` : fmtPct(c.pct);
}

/** The live series for a quote: last price joined to CNBC daily closes. Null without a price. */
export function liveFor(q: Quote | undefined, history: History | undefined, now: Date): LiveSeries | null {
  if (!q || q.last === null) return null;
  const dateKey = quoteStamp(q, now)?.dateKey ?? nyParts(now).dateKey;
  return liveSeries(history?.status === "ok" ? history.points : [], q.last, dateKey);
}

/** As liveFor, but for % changes: ends at the last daily close when the live quote is rounded coarser. */
export function liveForChange(q: Quote | undefined, history: History | undefined, now: Date): LiveSeries | null {
  if (!q || q.last === null) return null;
  const dateKey = quoteStamp(q, now)?.dateKey ?? nyParts(now).dateKey;
  return precisePairSeries(history?.status === "ok" ? history.points : [], q.last, q.decimals, dateKey);
}

type Props = { def: LiveDef; quote: Quote | undefined; history: History | undefined; now: Date; feedError: boolean };

/** A CNBC-priced card: live value with its session, day change, 1m / 1y vs daily closes, sparkline. */
export function LiveCard({ def, quote, history, now, feedError }: Props) {
  const title = (
    <Link href={quoteHref(def.symbol)} className="underline-offset-2 hover:underline">
      {def.label}
    </Link>
  );
  if (!quote) {
    if (!feedError) return <SkeletonCard />;
    return (
      <CardShell title={def.label} detail={def.detail} badge="Live">
        <p className="text-[13px] text-muted">Live quote unavailable from CNBC right now. It retries every few seconds.</p>
      </CardShell>
    );
  }
  const series = liveFor(quote, history, now);
  const prov = quoteProvenance(quote, now);
  const footer = (
    <div className="space-y-0.5">
      <SourceTag provenance={prov} />
      <p className="text-[11.5px] text-faint">1m and 1y against CNBC daily closes</p>
    </div>
  );
  if (!series) {
    return (
      <CardShell title={title} detail={def.detail} badge="Live" footer={footer}>
        <p className="text-[13px] text-muted">CNBC returned no price for {def.symbol}.</p>
      </CardShell>
    );
  }
  const histNote =
    history?.status === "error" ? `CNBC history unavailable (${history.error ?? "request failed"}), so no 1m / 1y change.` : null;
  const pending = !history || history.status === "loading";
  return (
    <CardShell title={title} detail={def.detail} badge="Live" footer={footer}>
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span className="num text-[21px] font-medium leading-tight">{fmtNumber(series.latest.value, def.decimals)}</span>
        {quote.changePct !== null && (
          <span className="num text-[12.5px] text-muted" title="Change on the day, from CNBC">
            {fmtPct(quote.changePct)} day
          </span>
        )}
      </p>
      <ChangeRow
        items={[
          { label: "1m", text: pending ? "…" : fmtChange(def.kind, series.m1, def.decimals), title: series.m1 ? `vs close on ${series.m1.from.date}` : undefined },
          { label: "1y", text: pending ? "…" : fmtChange(def.kind, series.y1, def.decimals), title: series.y1 ? `vs close on ${series.y1.from.date}` : undefined },
        ]}
      />
      <div className="mt-auto pt-2.5">
        {pending ? <div className="skeleton h-10 w-full" /> : <MiniLine points={liveSpark(series)} label={def.label} />}
      </div>
      {histNote && <p className="mt-1.5 text-[11.5px] leading-snug text-faint">{histNote}</p>}
    </CardShell>
  );
}
