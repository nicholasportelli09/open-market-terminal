import type { DcfInputs, DcfResult, DcfRow } from "./types";
import { expandSeries, isFiniteNumber, validateDcfInputs } from "./validate";

/** Terminal value above this share of enterprise value is flagged: the answer is mostly the terminal assumption. */
export const TERMINAL_SHARE_WARNING = 0.75;

function forecastRows(inputs: DcfInputs): DcfRow[] {
  const { years, wacc, mode } = inputs;
  const growth = expandSeries(inputs.revenueGrowth, years);
  const fcfMargin = mode === "fcfMargin" ? expandSeries(inputs.fcfMargin ?? [], years) : [];
  const ebitMargin = mode === "fundamental" ? expandSeries(inputs.ebitMargin ?? [], years) : [];
  const taxRate = inputs.taxRate ?? 0;
  const salesToCapital = inputs.salesToCapital ?? 1;
  const shift = inputs.midYear ? 0.5 : 0;

  const rows: DcfRow[] = [];
  let prevRevenue = inputs.baseRevenue;
  for (let i = 0; i < years; i++) {
    const year = i + 1;
    const revenue = prevRevenue * (1 + growth[i]);
    const discountFactor = 1 / Math.pow(1 + wacc, year - shift);
    if (mode === "fcfMargin") {
      const fcf = revenue * fcfMargin[i];
      rows.push({ year, revenue, growth: growth[i], fcf, discountFactor, pv: fcf * discountFactor });
    } else {
      const ebit = revenue * ebitMargin[i];
      const nopat = ebit * (1 - taxRate);
      const reinvestment = (revenue - prevRevenue) / salesToCapital;
      const fcf = nopat - reinvestment;
      rows.push({ year, revenue, growth: growth[i], ebit, nopat, reinvestment, fcf, discountFactor, pv: fcf * discountFactor });
    }
    prevRevenue = revenue;
  }
  return rows;
}

/**
 * Cash flow in year N+1, the first year of the perpetuity.
 * fcfMargin mode: FCF_N * (1 + g).
 * fundamental mode: revenue grows at g after year N, so reinvestment is sized for g, not for the final forecast
 * year's growth: FCF_{N+1} = NOPAT_N * (1 + g) - g * Revenue_N / salesToCapital
 * (= NOPAT_{N+1} * (1 - g / ROIC) with incremental ROIC = ebitMargin_N * (1 - taxRate) * salesToCapital).
 */
function terminalCashFlow(inputs: DcfInputs, last: DcfRow): number {
  const g = inputs.terminalGrowth;
  if (inputs.mode === "fcfMargin") return last.fcf * (1 + g);
  return (last.nopat ?? 0) * (1 + g) - (g * last.revenue) / (inputs.salesToCapital ?? 1);
}

function warningsFor(terminalFcf: number, enterpriseValue: number, equityValue: number, share: number | null): string[] {
  const warnings: string[] = [];
  if (terminalFcf <= 0) warnings.push("Terminal-year cash flow is zero or negative, so the terminal value is too.");
  if (enterpriseValue <= 0) warnings.push("Enterprise value is zero or negative.");
  if (equityValue <= 0) warnings.push("Equity value is zero or negative: claims (net debt and adjustments) exceed enterprise value.");
  if (share !== null && share > TERMINAL_SHARE_WARNING) {
    warnings.push(`Terminal value is ${Math.round(share * 100)} % of enterprise value; the result rests mostly on terminal assumptions.`);
  }
  return warnings;
}

/**
 * Discounted cash flow valuation.
 *
 * - Revenue_t = Revenue_{t-1} * (1 + growth_t), starting from baseRevenue.
 * - Discount factor 1/(1+wacc)^t, or 1/(1+wacc)^(t-0.5) with midYear.
 * - Terminal value (Gordon) = FCF_{N+1} / (wacc - g), discounted at the full N years even with midYear.
 *   FCF_{N+1} = FCF_N * (1 + g) in fcfMargin mode; in fundamental mode it is NOPAT_N * (1 + g) minus the
 *   reinvestment needed to grow revenue at g (g * Revenue_N / salesToCapital), so value rises with growth
 *   whenever incremental ROIC exceeds WACC.
 * - Equity = EV - netDebt - otherAdjustments; perShare = equity / sharesDiluted.
 *
 * Invalid inputs return { ok: false, errors } and never NaN. Negative values (e.g. negative FCF) are returned
 * as computed with a warning; they are not clamped.
 */
export function runDcf(inputs: DcfInputs): DcfResult {
  const validation = validateDcfInputs(inputs);
  if (!validation.ok) return validation;

  const rows = forecastRows(inputs);
  const { wacc, terminalGrowth, years } = inputs;
  const sumPv = rows.reduce((s, r) => s + r.pv, 0);
  const terminalFcf = terminalCashFlow(inputs, rows[rows.length - 1]);
  const terminalValue = terminalFcf / (wacc - terminalGrowth);
  const pvTerminal = terminalValue / Math.pow(1 + wacc, years);
  const enterpriseValue = sumPv + pvTerminal;
  const equityValue = enterpriseValue - inputs.netDebt - (inputs.otherAdjustments ?? 0);
  const perShare = equityValue / inputs.sharesDiluted;
  const terminalShareOfEv = enterpriseValue > 0 ? pvTerminal / enterpriseValue : null;

  if (![sumPv, terminalFcf, terminalValue, pvTerminal, enterpriseValue, equityValue, perShare].every(isFiniteNumber)) {
    return { ok: false, errors: ["The inputs overflow to a non-finite result; check for extreme growth or margins."] };
  }

  return {
    ok: true,
    rows,
    sumPv,
    terminalFcf,
    terminalValue,
    pvTerminal,
    enterpriseValue,
    equityValue,
    perShare,
    terminalShareOfEv,
    warnings: warningsFor(terminalFcf, enterpriseValue, equityValue, terminalShareOfEv),
  };
}

/** Per-share value only, or null when the inputs are invalid. Convenience for solvers and grids. */
export function dcfPerShare(inputs: DcfInputs): number | null {
  const result = runDcf(inputs);
  return result.ok ? result.perShare : null;
}
