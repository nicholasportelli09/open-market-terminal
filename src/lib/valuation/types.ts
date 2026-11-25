/**
 * Valuation engine types. Pure math: no React, no network, no data fetching.
 *
 * Units: every rate is a decimal (0.08 = 8 %). Money values (baseRevenue, netDebt, otherAdjustments) share one
 * currency unit (e.g. USD millions) and sharesDiluted uses the matching share unit (e.g. millions), so
 * perShare comes out in currency per share.
 *
 * Per-year arrays (revenueGrowth, fcfMargin, ebitMargin): element 0 is forecast year 1. An array shorter than
 * `years` is extended with its LAST value (e.g. growth [0.10, 0.05] over 5 years = 10 %, 5 %, 5 %, 5 %, 5 %).
 * Elements beyond `years` are ignored. An empty array is a validation error.
 */

export type DcfMode = "fcfMargin" | "fundamental";

export type DcfInputs = {
  /** Last reported (year 0) revenue. Must be > 0. */
  baseRevenue: number;
  /** Forecast horizon, integer 3 to 15. */
  years: number;
  /** Revenue growth per forecast year (decimals, each >= -1). */
  revenueGrowth: number[];
  /**
   * "fcfMargin": FCF = revenue * fcfMargin.
   * "fundamental": EBIT = revenue * ebitMargin, NOPAT = EBIT * (1 - taxRate),
   *   reinvestment = (revenue_t - revenue_{t-1}) / salesToCapital, FCFF = NOPAT - reinvestment.
   */
  mode: DcfMode;
  /** fcfMargin mode: FCF / revenue per year, each in [-1, 1]. */
  fcfMargin?: number[];
  /** fundamental mode: EBIT / revenue per year, each in [-1, 1]. */
  ebitMargin?: number[];
  /** fundamental mode: tax rate on EBIT, in [0, 1]. */
  taxRate?: number;
  /** fundamental mode: revenue added per unit of capital invested. Must be > 0. */
  salesToCapital?: number;
  /** Discount rate (WACC). Must be in (0, 1] and greater than terminalGrowth. */
  wacc: number;
  /** Perpetual growth after the forecast (Gordon growth). Must be > -1 and < wacc. */
  terminalGrowth: number;
  /** Debt minus cash. Negative = net cash (adds to equity). */
  netDebt: number;
  /** Diluted share count. Must be > 0. */
  sharesDiluted: number;
  /**
   * Mid-year convention: cash flows arrive mid-year, discount factor 1/(1+wacc)^(t-0.5).
   * The terminal value is still discounted at the full N years (1/(1+wacc)^N).
   */
  midYear?: boolean;
  /** Other claims subtracted from equity value (minority interest, preferred, pensions...). Default 0. */
  otherAdjustments?: number;
};

export type DcfRow = {
  /** Forecast year, 1-based. */
  year: number;
  revenue: number;
  growth: number;
  /** fundamental mode only. */
  ebit?: number;
  /** fundamental mode only. */
  nopat?: number;
  /** fundamental mode only. */
  reinvestment?: number;
  fcf: number;
  discountFactor: number;
  pv: number;
};

export type DcfSuccess = {
  ok: true;
  rows: DcfRow[];
  sumPv: number;
  /**
   * Cash flow in year N+1. fcfMargin: FCF_N * (1 + g). fundamental: NOPAT_N * (1 + g) - g * Revenue_N /
   * salesToCapital (reinvestment sized for terminal growth g, not the final forecast year's growth).
   */
  terminalFcf: number;
  /** Gordon growth value at the end of year N: terminalFcf / (wacc - g). */
  terminalValue: number;
  /** terminalValue / (1 + wacc)^N (full N years, also with midYear). */
  pvTerminal: number;
  enterpriseValue: number;
  /** enterpriseValue - netDebt - otherAdjustments. */
  equityValue: number;
  perShare: number;
  /** pvTerminal / enterpriseValue; null when enterpriseValue <= 0 (ratio meaningless). */
  terminalShareOfEv: number | null;
  /** Plain-language notes about results that are mathematically valid but need care (never errors). */
  warnings: string[];
};

export type Invalid = { ok: false; errors: string[] };

export type DcfResult = DcfSuccess | Invalid;

export type Validation = { ok: true } | Invalid;
