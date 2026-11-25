type SparklineProps = {
  points: number[] | undefined;
  baseline?: number | null;
  up: boolean;
  width?: number;
  height?: number;
  className?: string;
};

/** Small SVG sparkline with a soft fill and an optional dotted previous-close baseline. */
export function Sparkline({ points, baseline, up, width = 120, height = 36, className = "" }: SparklineProps) {
  // Loading: a placeholder. Loaded but too few points (e.g. a market closed all session): keep the space empty.
  if (!points || points.length < 2) {
    return <div className={`${points ? "" : "skeleton"} ${className}`} style={{ width, height, maxWidth: "100%" }} aria-hidden />;
  }
  const values = baseline != null ? [...points, baseline] : points;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pad = 2;
  const x = (i: number) => (i / (points.length - 1)) * width;
  const y = (v: number) => pad + (1 - (v - min) / span) * (height - pad * 2);
  const line = points.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const area = `${line}L${width},${height}L0,${height}Z`;
  const color = up ? "var(--up)" : "var(--down)";
  const id = `sg-${up ? "u" : "d"}`;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} className={className} preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.18" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {baseline != null && (
        <line x1="0" x2={width} y1={y(baseline)} y2={y(baseline)} stroke="var(--faint)" strokeDasharray="2 3" strokeWidth="1" />
      )}
      <path d={area} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
