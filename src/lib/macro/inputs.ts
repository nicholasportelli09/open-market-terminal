/**
 * Collects the readings the implication rules need. Pure: the page passes in what it loaded, and
 * anything missing simply stays undefined (the matching rule then produces no note).
 */
import type { MacroInputs, Obs } from "./implications";
import { wasNegativeWithin } from "./math";
import type { Reading } from "./readings";

export type LiveObs = { value: number; asOf: string } | null;

function obs(r: Reading | null | undefined): Obs | undefined {
  return r ? { value: r.latest.value, asOf: r.latest.date } : undefined;
}

/**
 * `get(id)` returns the reading for a FRED series id (or null). `liveVix` is the live CNBC VIX when
 * the quote has a price; it is preferred over FRED's daily close, which lags by a day or more.
 */
export function buildInputs(get: (id: string) => Reading | null | undefined, liveVix: LiveObs): MacroInputs {
  const t10y3m = get("T10Y3M");
  const t10y2y = get("T10Y2Y");
  const curve = t10y3m ?? t10y2y;
  const dollar = get("DTWEXBGS");
  const fredVix = get("VIXCLS");
  const vix = liveVix
    ? { ...liveVix, source: "CNBC live" }
    : fredVix
      ? { value: fredVix.latest.value, asOf: fredVix.latest.date, source: "FRED daily close" }
      : undefined;
  return {
    t10y3m: obs(t10y3m),
    t10y2y: obs(t10y2y),
    curveInvertedWithin1y: curve ? wasNegativeWithin(curve.points, 12) : undefined,
    hyOas: obs(get("BAMLH0A0HYM2")),
    real10y: obs(get("DFII10")),
    vix,
    corePce: obs(get("PCEPILFE")),
    dollar1y: dollar?.y1?.pct != null ? { value: dollar.y1.pct, asOf: dollar.latest.date } : undefined,
    nfci: obs(get("NFCI")),
  };
}
