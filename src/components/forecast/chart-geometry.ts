/** Pure geometry for the price-target chart: scales, ticks, label de-collision. */

export const DAY_SEC = 86_400;
export const YEAR_SEC = 365 * DAY_SEC;

export type Point = { t: number; c: number };
export type TargetLine = { id: "high" | "average" | "low"; label: string; value: number };

export type Frame = { width: number; height: number; left: number; right: number; top: number; bottom: number };

export type Scales = {
  x: (t: number) => number;
  y: (v: number) => number;
  tFromX: (x: number) => number;
  t0: number;
  tNow: number;
  tEnd: number;
  lo: number;
  hi: number;
};

export function makeScales(points: Point[], price: number, targets: TargetLine[], f: Frame): Scales {
  const t0 = points[0].t;
  const tNow = points[points.length - 1].t;
  const tEnd = targets.length ? tNow + YEAR_SEC : tNow;
  const values = [...points.map((p) => p.c), price, ...targets.map((t) => t.value)];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = (max - min || max * 0.1 || 1) * 0.08;
  const lo = Math.max(0, min - pad);
  const hi = max + pad;
  const x0 = f.left;
  const x1 = f.width - f.right;
  const y0 = f.height - f.bottom;
  const y1 = f.top;
  const span = tEnd - t0 || 1;
  return {
    x: (t) => x0 + ((t - t0) / span) * (x1 - x0),
    y: (v) => y0 - ((v - lo) / (hi - lo || 1)) * (y0 - y1),
    tFromX: (x) => t0 + ((x - x0) / (x1 - x0 || 1)) * span,
    t0,
    tNow,
    tEnd,
    lo,
    hi,
  };
}

/** About `count` round price levels between lo and hi. */
export function niceTicks(lo: number, hi: number, count = 4): number[] {
  const raw = (hi - lo) / count;
  if (!(raw > 0)) return [lo];
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Number(v.toFixed(10)));
  return out;
}

/** Spread label centres so no two are closer than `gap`, staying inside [min, max]. Input order is kept. */
export function spreadLabels(ys: number[], gap: number, min: number, max: number): number[] {
  const order = ys.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y);
  for (let k = 1; k < order.length; k++) {
    if (order[k].y - order[k - 1].y < gap) order[k].y = order[k - 1].y + gap;
  }
  for (let k = order.length - 1; k >= 0; k--) {
    const ceiling = k === order.length - 1 ? max : order[k + 1].y - gap;
    if (order[k].y > ceiling) order[k].y = ceiling;
  }
  for (let k = 0; k < order.length; k++) {
    const floor = k === 0 ? min : order[k - 1].y + gap;
    if (order[k].y < floor) order[k].y = floor;
  }
  const out = new Array<number>(ys.length);
  for (const o of order) out[o.i] = o.y;
  return out;
}

/** "YYYY-MM-DD" for a bar time (wall-clock encoded as UTC seconds). */
export function dayOf(t: number): string {
  return new Date(t * 1000).toISOString().slice(0, 10);
}

/** "Nov '26" axis label. */
export function monthLabel(t: number): string {
  const d = new Date(t * 1000);
  const m = d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  return `${m} '${String(d.getUTCFullYear()).slice(2)}`;
}

/** Index of the point nearest to time t (points sorted by t). */
export function nearestIndex(points: Point[], t: number): number {
  let lo = 0;
  let hi = points.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (points[mid].t < t) lo = mid;
    else hi = mid;
  }
  return Math.abs(points[lo].t - t) <= Math.abs(points[hi].t - t) ? lo : hi;
}
