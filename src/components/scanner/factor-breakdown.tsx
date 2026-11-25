import { FACTORS, MIN_METRICS_PER_FACTOR, type Weights } from "@/lib/scanner/factors";
import { METRIC_LABEL, fmtMetric } from "@/lib/scanner/labels";
import type { ScoredRow } from "@/lib/scanner/scoring";
import type { ScreenRow } from "@/lib/scanner/types";
import { CompositeCell, FactorBar } from "./factor-bar";

type FactorBreakdownProps = { row: ScreenRow; scored: ScoredRow; weights: Weights; rank: number | null; universeSize: number };

/** How each factor score was built: metric value, its percentile among peers, and links to the raw metric. */
export function FactorBreakdown({ row, scored, weights, rank, universeSize }: FactorBreakdownProps) {
  const comp = scored.composite;
  return (
    <section aria-labelledby="fb-title" className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="fb-title" className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">Scores</h3>
        <span className="text-[12.5px] text-muted">
          Composite <CompositeCell value={comp.ok ? comp.value : null} reason={comp.ok ? undefined : comp.reason} />
          {rank !== null && <span className="text-faint"> · rank {rank} of {universeSize}</span>}
        </span>
      </div>
      {!comp.ok && <p className="text-[12px] text-muted">{comp.reason}</p>}
      <p className="text-[11.5px] leading-snug text-faint">
        Weighted mean of the scored factors with your weights ({FACTORS.map((f) => `${f.short} ${weights[f.id]}`).join(", ")}). Each metric
        score is its percentile rank among the screened companies it applies to (100 = best); a factor is the mean of its metric scores and
        needs at least {MIN_METRICS_PER_FACTOR}.
      </p>
      <ul className="divide-y divide-line rounded-xl border border-line">
        {FACTORS.map((f) => {
          const fs = scored.factors[f.id];
          return (
            <li key={f.id} className="px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-medium">{f.label}</span>
                <FactorBar label={f.label} score={fs.score} wide />
              </div>
              {fs.used.length > 0 && (
                <ul className="mt-1.5 space-y-0.5">
                  {fs.used.map((u) => (
                    <li key={u.key} className="flex flex-wrap items-baseline justify-between gap-x-3 text-[12px]">
                      <a href={`#m-${u.key}`} className="text-muted underline-offset-2 hover:text-fg hover:underline">
                        {METRIC_LABEL[u.key]} <span className="num text-fg">{fmtMetric(row.metrics[u.key], row.currency, u.key)}</span>
                      </a>
                      <span className="num text-faint">
                        score {Math.round(u.score)} · {u.better === "high" ? "higher" : "lower"} is better · {u.peers} peers
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {fs.missing.length > 0 && (
                <p className="mt-1 text-[11.5px] text-faint">
                  Not available (excluded):{" "}
                  {fs.missing.map((k, i) => (
                    <span key={k}>
                      {i > 0 && ", "}
                      <a href={`#m-${k}`} className="underline-offset-2 hover:text-muted hover:underline">{METRIC_LABEL[k]}</a>
                    </span>
                  ))}
                  {fs.score === null && ` · fewer than ${MIN_METRICS_PER_FACTOR} metrics, so no ${f.label.toLowerCase()} score`}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
