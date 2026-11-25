/**
 * Root finding for the reverse DCF: find x in [lo, hi] where fn(x) = target.
 *
 * 1. Sample fn on an even grid (SAMPLES + 1 points) and record whether it is monotonic on that grid.
 * 2. Find grid intervals where fn - target changes sign.
 *    - none: no solution in range (the reachable min / max are returned so the UI can say why)
 *    - more than one: ambiguous, every approximate root is returned and nothing is picked
 *    - exactly one: bisect it to TOLERANCE.
 * Grid points where fn is undefined (null) split the range; brackets never span them.
 */

export const SAMPLES = 150;
export const TOLERANCE = 1e-12;
const MAX_ITERATIONS = 200;

export type SolveSuccess = { ok: true; value: number; monotonic: boolean; iterations: number };
export type SolveFailure = {
  ok: false;
  reason: "no solution in range" | "multiple solutions in range" | "invalid inputs" | "invalid target";
  message: string;
  /** Smallest and largest value fn reaches on the sampled grid, when any was defined. */
  reachable?: { min: number; max: number };
  /** Approximate roots when more than one exists. */
  roots?: number[];
  errors?: string[];
};
export type SolveResult = SolveSuccess | SolveFailure;

type Point = { x: number; y: number | null };

function bisect(fn: (x: number) => number | null, target: number, lo: number, hi: number, yLo: number) {
  let a = lo;
  let b = hi;
  let fa = yLo - target;
  let iterations = 0;
  while (b - a > TOLERANCE && iterations < MAX_ITERATIONS) {
    iterations++;
    const mid = (a + b) / 2;
    const y = fn(mid);
    if (y === null) break; // cannot happen inside a bracket of defined points unless fn has a hole; stop safely
    const fm = y - target;
    if (fm === 0) return { value: mid, iterations };
    if (Math.sign(fm) === Math.sign(fa)) {
      a = mid;
      fa = fm;
    } else {
      b = mid;
    }
  }
  return { value: (a + b) / 2, iterations };
}

function isMonotonic(points: Point[]): boolean {
  const ys = points.map((p) => p.y).filter((y): y is number => y !== null);
  let up = true;
  let down = true;
  for (let i = 1; i < ys.length; i++) {
    if (ys[i] < ys[i - 1]) up = false;
    if (ys[i] > ys[i - 1]) down = false;
  }
  return up || down;
}

export function solveMonotonic(
  fn: (x: number) => number | null,
  target: number,
  lo: number,
  hi: number,
): SolveResult {
  if (!Number.isFinite(target)) return { ok: false, reason: "invalid target", message: "Target must be a finite number." };

  const points: Point[] = Array.from({ length: SAMPLES + 1 }, (_, i) => {
    const x = i === SAMPLES ? hi : lo + ((hi - lo) * i) / SAMPLES;
    return { x, y: fn(x) };
  });
  const defined = points.map((p) => p.y).filter((y): y is number => y !== null);
  if (defined.length === 0) {
    return { ok: false, reason: "invalid inputs", message: "The model has no valid result anywhere in the search range." };
  }
  const reachable = { min: Math.min(...defined), max: Math.max(...defined) };
  const monotonic = isMonotonic(points);

  const brackets: Array<[Point, Point]> = [];
  const exact: number[] = [];
  points.forEach((p, i) => {
    if (p.y === null) return;
    if (p.y === target) exact.push(p.x);
    const q = points[i + 1];
    if (!q || q.y === null || q.y === target || p.y === target) return;
    if (Math.sign(p.y - target) !== Math.sign(q.y - target)) brackets.push([p, q]);
  });

  const count = brackets.length + exact.length;
  if (count === 0) {
    return { ok: false, reason: "no solution in range", message: `No value in [${lo}, ${hi}] reaches the target.`, reachable };
  }
  if (count > 1) {
    const roots = [...exact, ...brackets.map(([p, q]) => bisect(fn, target, p.x, q.x, p.y as number).value)].sort((a, b) => a - b);
    return { ok: false, reason: "multiple solutions in range", message: "More than one value reaches the target; the answer is ambiguous.", reachable, roots };
  }
  if (exact.length === 1) return { ok: true, value: exact[0], monotonic, iterations: 0 };
  const [p, q] = brackets[0];
  const { value, iterations } = bisect(fn, target, p.x, q.x, p.y as number);
  return { ok: true, value, monotonic, iterations };
}
