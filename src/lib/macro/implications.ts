/**
 * "What this usually means for equities": deterministic rules from current readings to short notes.
 *
 * Every rule states its threshold and describes a general historical relationship. None of them is
 * a forecast, a timing signal or a buy/sell call; the UI labels each note "Interpretation".
 * A rule whose input is missing produces nothing (never a default reading).
 *
 * Rules and thresholds:
 * - curve: 10y-3m Treasury spread (falls back to 10y-2y). Below 0 = inverted. At or above 0 after an
 *   inversion within the past year = re-steepening. Otherwise normal.
 * - credit: ICE BofA US high yield OAS. At or above 6.00% = stress; at or below 3.50% = tight; else normal.
 * - real-yield: 10y TIPS yield. Above 2.00% = restrictive; at or below 0 = negative; else moderate.
 * - vix: below 15 = calm; 15 to below 20 = normal; 20 to below 30 = elevated; 30 and above = stress.
 * - inflation: core PCE YoY vs the Fed's 2% goal. 3.0% and above = well above; above 2.5% = above;
 *   1.5% to 2.5% = near target; below 1.5% = below.
 * - dollar: 1-year change of the broad trade-weighted dollar. +5% and above = strong rise;
 *   -5% and below = clear fall; else little changed.
 * - conditions: Chicago Fed NFCI. Above 0 = tighter than average; at or below 0 = looser.
 */

export const THRESHOLDS = {
  curveInverted: 0,
  hyStress: 6.0,
  hyTight: 3.5,
  realHigh: 2.0,
  realNegative: 0,
  vixNormal: 15,
  vixElevated: 20,
  vixStress: 30,
  inflationTarget: 2.0,
  inflationAbove: 2.5,
  inflationWellAbove: 3.0,
  inflationBelow: 1.5,
  dollarMove: 5,
  nfciNeutral: 0,
} as const;

export type Obs = { value: number; asOf: string };

export type MacroInputs = {
  t10y3m?: Obs;
  t10y2y?: Obs;
  /** Any 10y-3m (or 10y-2y when that is the input) observation below 0 in the past 12 months. */
  curveInvertedWithin1y?: boolean;
  hyOas?: Obs;
  real10y?: Obs;
  /** Live VIX when available, else the latest FRED close; `source` says which. */
  vix?: Obs & { source: string };
  corePce?: Obs;
  /** 1-year % change of the broad dollar index. */
  dollar1y?: Obs;
  nfci?: Obs;
};

export type Tone = "headwind" | "supportive" | "neutral";

export type Implication = {
  id: "curve" | "credit" | "real-yield" | "vix" | "inflation" | "dollar" | "conditions";
  topic: string;
  /** The reading in words, e.g. "10y-3m at -35 bp". */
  reading: string;
  /** The rule applied, e.g. "Inverted when below 0 bp". */
  threshold: string;
  note: string;
  tone: Tone;
  asOf: string;
};

const bp = (pct: number) => `${pct >= 0 ? "+" : "−"}${Math.abs(Math.round(pct * 100))} bp`;
const pct = (v: number, d = 2) => `${v.toFixed(d)}%`;

export function curveRule(i: MacroInputs): Implication | null {
  const obs = i.t10y3m ?? i.t10y2y;
  if (!obs) return null;
  const name = i.t10y3m ? "10y−3m" : "10y−2y";
  const base = { id: "curve" as const, topic: "Yield curve", reading: `${name} at ${bp(obs.value)}`, asOf: obs.asOf };
  if (obs.value < THRESHOLDS.curveInverted) {
    return {
      ...base,
      threshold: "Inverted when below 0 bp",
      tone: "headwind",
      note: "Has preceded most US recessions, often by 6 to 24 months.",
    };
  }
  if (i.curveInvertedWithin1y) {
    return {
      ...base,
      threshold: "Back at or above 0 bp after an inversion in the past 12 months",
      tone: "headwind",
      note: "Recessions have often started around when the curve turned positive again.",
    };
  }
  return {
    ...base,
    threshold: "Normal when at or above 0 bp with no inversion in the past 12 months",
    tone: "neutral",
    note: "The usual state; not a warning sign on its own.",
  };
}

export function creditRule(i: MacroInputs): Implication | null {
  const o = i.hyOas;
  if (!o) return null;
  const base = { id: "credit" as const, topic: "Credit spreads", reading: `High yield spread ${bp(o.value).replace("+", "")}`, asOf: o.asOf };
  if (o.value >= THRESHOLDS.hyStress) {
    return {
      ...base,
      threshold: "Stress at or above 600 bp",
      tone: "headwind",
      note: "Seen in 2001-02, 2008-09 and 2020, alongside large equity drawdowns.",
    };
  }
  if (o.value <= THRESHOLDS.hyTight) {
    return {
      ...base,
      threshold: "Tight at or below 350 bp",
      tone: "neutral",
      note: "Calm credit markets, with little cushion if things worsen.",
    };
  }
  return {
    ...base,
    threshold: "Normal between 350 and 600 bp",
    tone: "neutral",
    note: "Neither unusual calm nor stress.",
  };
}

export function realYieldRule(i: MacroInputs): Implication | null {
  const o = i.real10y;
  if (!o) return null;
  const base = { id: "real-yield" as const, topic: "Real yields", reading: `10y real yield ${pct(o.value)}`, asOf: o.asOf };
  if (o.value > THRESHOLDS.realHigh) {
    return {
      ...base,
      threshold: "High above 2.00%",
      tone: "headwind",
      note: "Safe bonds pay well after inflation; weighs most on expensive growth stocks.",
    };
  }
  if (o.value <= THRESHOLDS.realNegative) {
    return {
      ...base,
      threshold: "Negative at or below 0%",
      tone: "supportive",
      note: "Bonds lose to inflation, pushing money toward stocks.",
    };
  }
  return { ...base, threshold: "Moderate between 0% and 2.00%", tone: "neutral", note: "A middle range; not a strong force either way." };
}

export function vixRule(i: MacroInputs): Implication | null {
  const o = i.vix;
  if (!o) return null;
  const base = { id: "vix" as const, topic: "Volatility", reading: `VIX ${o.value.toFixed(2)} (${o.source})`, asOf: o.asOf };
  if (o.value >= THRESHOLDS.vixStress) {
    return { ...base, threshold: "Stress at 30 and above", tone: "headwind", note: "Comes with sharp sell-offs; big daily swings tend to persist." };
  }
  if (o.value >= THRESHOLDS.vixElevated) {
    return { ...base, threshold: "Elevated from 20 to below 30", tone: "neutral", note: "Bigger swings than usual; common around corrections." };
  }
  if (o.value >= THRESHOLDS.vixNormal) {
    return { ...base, threshold: "Normal from 15 to below 20", tone: "neutral", note: "Close to its long-run typical range." };
  }
  return { ...base, threshold: "Calm below 15", tone: "supportive", note: "Calm tends to last, but leaves markets open to surprises." };
}

export function inflationRule(i: MacroInputs): Implication | null {
  const o = i.corePce;
  if (!o) return null;
  const base = { id: "inflation" as const, topic: "Inflation", reading: `Core PCE ${pct(o.value, 1)} year on year`, asOf: o.asOf };
  if (o.value >= THRESHOLDS.inflationWellAbove) {
    return { ...base, threshold: "Well above the 2% goal at 3.0% and above", tone: "headwind", note: "The Fed has kept policy tight here, pressuring valuations." };
  }
  if (o.value > THRESHOLDS.inflationAbove) {
    return { ...base, threshold: "Above the 2% goal when over 2.5%", tone: "neutral", note: "Limits how fast the Fed cuts rates." };
  }
  if (o.value >= THRESHOLDS.inflationBelow) {
    return { ...base, threshold: "Near the 2% goal from 1.5% to 2.5%", tone: "supportive", note: "Gives the Fed room to support growth." };
  }
  return { ...base, threshold: "Below 1.5%", tone: "neutral", note: "Has signalled weak demand." };
}

export function dollarRule(i: MacroInputs): Implication | null {
  const o = i.dollar1y;
  if (!o) return null;
  const sign = o.value >= 0 ? "+" : "−";
  const base = { id: "dollar" as const, topic: "Dollar trend", reading: `Broad dollar ${sign}${Math.abs(o.value).toFixed(1)}% over 1 year`, asOf: o.asOf };
  if (o.value >= THRESHOLDS.dollarMove) {
    return { ...base, threshold: "Strong rise at +5% or more in a year", tone: "headwind", note: "Trims US multinationals' overseas earnings; weighs on emerging markets." };
  }
  if (o.value <= -THRESHOLDS.dollarMove) {
    return { ...base, threshold: "Clear fall at −5% or more in a year", tone: "supportive", note: "Lifts US multinationals' overseas earnings; eases conditions abroad." };
  }
  return { ...base, threshold: "Little changed within ±5% in a year", tone: "neutral", note: "Too small a move to matter much for stocks." };
}

export function conditionsRule(i: MacroInputs): Implication | null {
  const o = i.nfci;
  if (!o) return null;
  const base = { id: "conditions" as const, topic: "Financial conditions", reading: `NFCI ${o.value >= 0 ? "+" : "−"}${Math.abs(o.value).toFixed(3)}`, asOf: o.asOf };
  if (o.value > THRESHOLDS.nfciNeutral) {
    return { ...base, threshold: "Tighter than average above 0", tone: "headwind", note: "Tighter credit and funding than usual; harder for risk assets." };
  }
  return { ...base, threshold: "Looser than average at or below 0", tone: "supportive", note: "Easier borrowing than usual; supports risk assets." };
}

const RULES = [curveRule, creditRule, realYieldRule, vixRule, inflationRule, dollarRule, conditionsRule];

export function implications(inputs: MacroInputs): Implication[] {
  return RULES.map((r) => r(inputs)).filter((x): x is Implication => x !== null);
}
