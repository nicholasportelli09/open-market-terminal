import { RATING_KEYS, RATING_LABEL, type AnalystDistribution, type DistributionMonth } from "@/lib/analyst-types";
import type { Provenance } from "@/lib/provenance";
import { Label, RATING_BG, SourcesFooter } from "./section-state";

function monthShort(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
}

function monthLong(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

function Current({ d }: { d: AnalystDistribution }) {
  const c = d.current;
  if (!c || d.currentTotal === 0) return null;
  return (
    <div className="space-y-3">
      <div className="flex h-2.5 overflow-hidden rounded-full bg-hover" aria-hidden>
        {RATING_KEYS.map((k) => (c[k] > 0 ? <div key={k} className={RATING_BG[k]} style={{ width: `${(c[k] / d.currentTotal) * 100}%` }} /> : null))}
      </div>
      <ul className="grid grid-cols-5 gap-1 text-center">
        {RATING_KEYS.map((k) => (
          <li key={k} className="min-w-0">
            <div className="num text-[18px] font-semibold leading-tight">{c[k]}</div>
            <div className="mt-0.5 flex flex-col items-center gap-1 text-[11px] leading-tight text-muted sm:flex-row sm:justify-center">
              <span className={`h-2 w-2 shrink-0 rounded-sm ${RATING_BG[k]}`} aria-hidden />
              <span>{RATING_LABEL[k]}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Trend({ trend }: { trend: DistributionMonth[] }) {
  const max = Math.max(...trend.map((m) => m.total), 1);
  return (
    <div>
      <div className="flex h-32 items-end gap-1.5" aria-hidden>
        {trend.map((m) => (
          <div key={m.period} className="flex h-full min-w-0 max-w-12 flex-1 flex-col items-center justify-end gap-1" title={`${monthLong(m.period)}: ${RATING_KEYS.map((k) => `${m.counts[k]} ${RATING_LABEL[k]}`).join(", ")}`}>
            <div className="flex w-full max-w-7 flex-col-reverse overflow-hidden rounded-[3px]" style={{ height: `${(m.total / max) * 100}%` }}>
              {RATING_KEYS.map((k) => (m.counts[k] > 0 ? <div key={k} className={RATING_BG[k]} style={{ height: `${(m.counts[k] / m.total) * 100}%` }} /> : null))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-1.5" aria-hidden>
        {trend.map((m, i) => (
          <div key={m.period} className="num min-w-0 max-w-12 flex-1 text-center text-[10.5px] text-faint">
            {trend.length > 8 && i % 2 === 1 ? "" : monthShort(m.period)}
          </div>
        ))}
      </div>
      <div className="sr-only">
      <table>
        <caption>Monthly analyst ratings</caption>
        <thead>
          <tr>
            <th scope="col">Month</th>
            {RATING_KEYS.map((k) => (
              <th key={k} scope="col">{RATING_LABEL[k]}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {trend.map((m) => (
            <tr key={m.period}>
              <th scope="row">{monthLong(m.period)}</th>
              {RATING_KEYS.map((k) => (
                <td key={k}>{m.counts[k]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}

/** Strong Buy ... Strong Sell counts now, plus the monthly history when the provider gives one. */
export function RatingDistribution({ d }: { d: AnalystDistribution }) {
  const sources = [d.provenance, d.trendProvenance].filter((p): p is Provenance => !!p);
  return (
    <>
      <div className="space-y-5 px-4 py-4">
        <div className="space-y-2">
          <Label>Current ratings · {d.currentTotal} analysts</Label>
          <Current d={d} />
        </div>
        {d.trend.length > 1 && (
          <div className="space-y-2">
            <Label>Monthly history</Label>
            <Trend trend={d.trend} />
          </div>
        )}
      </div>
      <div className="border-t border-line">
        <SourcesFooter list={sources} />
      </div>
    </>
  );
}
