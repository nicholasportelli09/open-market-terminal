import { SourceTag } from "@/components/ui/source-tag";
import { fmtDateKey } from "@/lib/format";
import { METRIC_LABEL, fmtMetric } from "@/lib/scanner/labels";
import { DERIVED_KEYS, SNAPSHOT_KEYS, type Catalyst, type ScanMetricKey, type ScreenRow } from "@/lib/scanner/types";

const ORDER: readonly ScanMetricKey[] = [...SNAPSHOT_KEYS, ...DERIVED_KEYS];

/** Every metric with its value (or why it is missing), formula and source line. Anchors #m-<key>. */
export function MetricsList({ row }: { row: ScreenRow }) {
  return (
    <section aria-labelledby="ml-title">
      <h3 id="ml-title" className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">All metrics</h3>
      <dl className="mt-2 divide-y divide-line rounded-xl border border-line">
        {ORDER.map((k) => {
          const m = row.metrics[k];
          return (
            <div key={k} id={`m-${k}`} className="scroll-mt-20 px-3 py-2 target:bg-hover">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-[12.5px] text-muted">{METRIC_LABEL[k]}</dt>
                <dd className="num text-[13px] font-medium">{fmtMetric(m, row.currency, k)}</dd>
              </div>
              <p className="mt-0.5 text-[11.5px] leading-snug text-faint">{m.value === null ? `Not available: ${m.reason ?? "missing input"}` : m.formula}</p>
              {m.provenance.asOf && <SourceTag provenance={m.provenance} className="block" />}
            </div>
          );
        })}
      </dl>
    </section>
  );
}

const KIND_LABEL: Record<Catalyst["kind"], string> = { earnings: "Earnings", ex_dividend: "Ex-dividend", filing_8k: "8-K" };

export function CatalystsList({ catalysts }: { catalysts: Catalyst[] }) {
  return (
    <section aria-labelledby="cl-title">
      <h3 id="cl-title" className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">Catalysts</h3>
      <p className="mt-1 text-[11.5px] leading-snug text-faint">
        Upcoming dated events from the CNBC calendar and 8-K filings of the last 30 days. The catalyst score counts them; it does not judge
        whether they are good or bad news.
      </p>
      {catalysts.length === 0 ? (
        <p className="mt-2 text-[12.5px] text-muted">No dated events found.</p>
      ) : (
        <ul className="mt-2 divide-y divide-line rounded-xl border border-line">
          {catalysts.map((c, i) => (
            <li key={`${c.kind}-${c.date}-${i}`} className="grid grid-cols-[88px_minmax(0,1fr)] gap-x-3 px-3 py-2">
              <span className="num text-[12.5px]">{fmtDateKey(c.date, true)}</span>
              <span className="min-w-0">
                <span className="text-[12.5px] font-medium">
                  {KIND_LABEL[c.kind]} · {c.label}
                </span>
                {c.estimated && <span className="ml-1.5 text-[11px] text-faint">estimated date</span>}
                {c.detail && <span className="block text-[12px] text-muted">{c.detail}</span>}
                <SourceTag provenance={c.provenance} className="block" />
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
