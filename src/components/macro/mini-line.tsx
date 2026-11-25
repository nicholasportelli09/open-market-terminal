import type { Point } from "@/lib/macro/math";

type MiniLineProps = {
  points: readonly Point[];
  /** Draw a dotted line at zero when it falls inside the range (spreads, NFCI). */
  zeroLine?: boolean;
  height?: number;
  label: string;
};

const W = 240;
const MAX_POINTS = 120;
const PAD = 3;

function thin(points: readonly Point[]): readonly Point[] {
  if (points.length <= MAX_POINTS) return points;
  const stride = (points.length - 1) / (MAX_POINTS - 1);
  return Array.from({ length: MAX_POINTS }, (_, i) => points[Math.round(i * stride)]);
}

/**
 * Neutral-coloured sparkline for macro series. Colour carries no "good / bad" meaning here:
 * a rising yield or VIX is not green news, so the line uses the foreground tone.
 */
export function MiniLine({ points, zeroLine = false, height = 40, label }: MiniLineProps) {
  if (points.length < 2) return <div style={{ height }} aria-hidden />;
  const pts = thin(points);
  const values = pts.map((p) => p.value);
  const lo = Math.min(...values, ...(zeroLine ? [0] : []));
  const hi = Math.max(...values, ...(zeroLine ? [0] : []));
  const span = hi - lo || 1;
  const x = (i: number) => (i / (pts.length - 1)) * W;
  const y = (v: number) => PAD + (1 - (v - lo) / span) * (height - PAD * 2);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join("");
  const first = pts[0];
  const last = pts[pts.length - 1];
  return (
    <svg
      viewBox={`0 0 ${W} ${height}`}
      preserveAspectRatio="none"
      className="block w-full"
      style={{ height }}
      role="img"
      aria-label={`${label}: history from ${first.date} to ${last.date}`}
    >
      {zeroLine && lo < 0 && hi > 0 && (
        <line x1="0" x2={W} y1={y(0)} y2={y(0)} stroke="var(--faint)" strokeDasharray="2 3" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      )}
      <path d={d} fill="none" stroke="var(--muted)" strokeWidth="1.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <circle cx={x(pts.length - 1)} cy={y(last.value)} r="2" fill="var(--fg)" />
    </svg>
  );
}
