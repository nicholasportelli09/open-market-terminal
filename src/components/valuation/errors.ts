/**
 * Turns valuation-engine validation messages into plain language for the lab. The engine speaks in input
 * names and decimals ("wacc (0.08) must be greater than terminalGrowth (0.09)"); the lab shows percentages.
 */

const NAMES: Record<string, string> = {
  revenueGrowth: "Revenue growth",
  fcfMargin: "FCF margin",
  ebitMargin: "EBIT margin",
  taxRate: "Tax rate",
  salesToCapital: "Sales to capital",
  wacc: "WACC",
  terminalGrowth: "Terminal growth",
  baseRevenue: "Base revenue",
  sharesDiluted: "Share count",
  netDebt: "Net debt",
  years: "Forecast years",
  otherAdjustments: "Other claims",
};

/** Inputs entered as percentages in the lab. */
const RATE_KEYS = new Set(["revenueGrowth", "fcfMargin", "ebitMargin", "taxRate", "wacc", "terminalGrowth"]);

const pct = (raw: string): string => {
  const n = Number(raw);
  return Number.isFinite(n) ? `${Number((n * 100).toFixed(2))}%` : raw;
};

const WACC_VS_G = /^wacc \(([^)]+)\) must be greater than terminalGrowth \(([^)]+)\)/;
const WEIGHT = /^Weight for (\w+) must be between 0 and 1 \(got ([^)]+)\)/;
const FIELD =/^([a-zA-Z]+)(?:\[(\d+)\])?\s+(.*)$/;

export function friendlyError(message: string): string {
  const wg = WACC_VS_G.exec(message);
  if (wg) {
    return `WACC (${pct(wg[1])}) must be higher than terminal growth (${pct(wg[2])}); the terminal value has no answer otherwise.`;
  }
  const wt = WEIGHT.exec(message);
  if (wt) return `Probability for ${wt[1]} must be between 0% and 100% (got ${pct(wt[2])}).`;
  const m = FIELD.exec(message);
  if (!m || !NAMES[m[1]]) return message;
  const [, key, index, rest] = m;
  const name = index === undefined ? NAMES[key] : `${NAMES[key]}, year ${Number(index) + 1}`;
  let text = rest.replace(/\s*\(fundamental mode\)/, " in Fundamental mode");
  if (RATE_KEYS.has(key)) {
    text = text
      .replace(/between -1 and 1/, "between -100% and 100%")
      .replace(/between 0 and 1/, "between 0% and 100%")
      .replace(/-1 or more/, "-100% or more")
      .replace(/greater than -1/, "greater than -100%")
      .replace(/at most 1\b/, "at most 100%")
      .replace(/\(got ([^)]+)\)/, (_, v: string) => `(got ${pct(v)})`);
  }
  return `${name} ${text}`;
}

/** De-duplicated friendly messages (per-year errors often repeat the same rule). */
export function friendlyErrors(messages: string[]): string[] {
  return [...new Set(messages.map(friendlyError))];
}
