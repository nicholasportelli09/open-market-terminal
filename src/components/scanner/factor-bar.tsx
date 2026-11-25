type FactorBarProps = { label: string; score: number | null; wide?: boolean };

/** Mini bar for a 0-100 percentile score; an empty track with a dash when there is no score. */
export function FactorBar({ label, score, wide = false }: FactorBarProps) {
  const text = score === null ? `${label}: no score (too few metrics)` : `${label}: ${Math.round(score)} of 100`;
  return (
    <span role="img" aria-label={text} title={text} className="inline-flex items-center gap-1.5">
      <span className={`relative h-1.5 overflow-hidden rounded-full bg-hover ${wide ? "w-24" : "w-9"}`}>
        {score !== null && <span className="absolute inset-y-0 left-0 rounded-full bg-fg/70" style={{ width: `${Math.max(3, score)}%` }} />}
      </span>
      <span className={`num w-6 text-right text-[11.5px] ${score === null ? "text-faint" : "text-muted"}`}>{score === null ? "—" : Math.round(score)}</span>
    </span>
  );
}

/** Composite score pill: the number in bold, "n/a" with the reason in the tooltip when insufficient. */
export function CompositeCell({ value, reason }: { value: number | null; reason?: string }) {
  if (value === null) {
    return (
      <span className="text-[11.5px] text-faint" title={reason}>
        Insufficient data
      </span>
    );
  }
  return <span className="num text-[13.5px] font-semibold">{value.toFixed(0)}</span>;
}
