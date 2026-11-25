import type { ReactNode } from "react";
import { impliedUpside, type AnalystData } from "@/lib/analyst-types";
import { fmtPct, fmtPrice } from "@/lib/format";
import { SOURCES, type Provenance } from "@/lib/provenance";
import { Panel } from "@/components/ui/panel";
import { IssueNotes, issuesFor, MissingSection, ratingTone, SourcesFooter } from "./section-state";

/** "FMP" / "Finnhub" for panel titles, so consensus is never confused with our own model. */
export function providerName(p: Provenance | undefined | null): string {
  if (!p) return "FMP";
  return p.source === "fmp" ? "FMP" : SOURCES[p.source]?.name ?? p.source;
}

function Stat({ label, children, sub }: { label: string; children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="min-w-0 px-4 py-3.5">
      <div className="text-[12px] text-faint">{label}</div>
      <div className="num mt-1 truncate text-[22px] font-semibold leading-tight tracking-tight">{children}</div>
      {sub && <div className="num mt-0.5 text-[12.5px]">{sub}</div>}
    </div>
  );
}

type SummaryProps = { data: AnalystData; price: number | null; decimals: number };

/** Total analysts, consensus rating and average target with implied upside (StockAnalysis-style summary row). */
export function ForecastSummary({ data, price, decimals }: SummaryProps) {
  const c = data.consensus;
  const t = data.targets;
  const title = `Analyst consensus (${providerName(c?.provenance ?? t?.provenance)})`;
  if (!c && !t) {
    return (
      <Panel title={title}>
        <MissingSection data={data} section={issuesFor(data, "consensus").length ? "consensus" : "targets"} emptyTitle="No analyst coverage found" emptyBody="FMP has no ratings or price targets for this symbol." />
      </Panel>
    );
  }
  const upside = impliedUpside(t?.average, price);
  const sources = [c?.provenance, t?.provenance].filter((p): p is Provenance => !!p);
  // Explain any "—" in the row here, not only further down the page.
  const gaps = [...(c ? [] : issuesFor(data, "consensus")), ...(t ? [] : issuesFor(data, "targets"))];
  return (
    <Panel title={title}>
      <div className="grid grid-cols-2 gap-px border-b border-line bg-line sm:grid-cols-4 [&>*]:bg-card">
        <Stat label="Total analysts" sub={c ? <span className="text-faint">{c.derived ? "Ratings, latest month" : "Current ratings"}</span> : null}>
          {c ? c.total : "—"}
        </Stat>
        <Stat label="Consensus rating" sub={c?.derived ? <span className="text-faint">Derived from counts</span> : null}>
          <span className={ratingTone(c?.ratingKey ?? null)}>{c ? c.rating : "—"}</span>
        </Stat>
        <Stat
          label="Average price target"
          sub={upside != null ? <span className={upside >= 0 ? "text-up" : "text-down"}>{fmtPct(upside, 1)} {upside >= 0 ? "upside" : "downside"}</span> : null}
        >
          {fmtPrice(t?.average, decimals)}
        </Stat>
        <Stat label="Targets, past 12 months" sub={t?.lastYearAverage != null ? <span className="text-faint">avg {fmtPrice(t.lastYearAverage, decimals)}</span> : null}>
          {t?.counts?.lastYear ?? "—"}
        </Stat>
      </div>
      <IssueNotes issues={gaps} className="border-b border-line px-4 py-2" />
      <SourcesFooter list={sources} />
    </Panel>
  );
}
