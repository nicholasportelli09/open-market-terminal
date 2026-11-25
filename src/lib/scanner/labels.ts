/** Display labels and value formatting for scanner metrics. Client-safe, pure. */
import { fmtCompact, fmtNumber } from "@/lib/format";
import type { ScanMetric, ScanMetricKey } from "./types";

export const METRIC_LABEL: Record<ScanMetricKey, string> = {
  marketCap: "Market cap",
  sharesOutstanding: "Shares outstanding",
  revenueTTM: "Revenue (TTM)",
  fcfTTM: "Free cash flow (TTM)",
  netDebt: "Net debt",
  enterpriseValue: "Enterprise value",
  equity: "Shareholders' equity",
  fcfYield: "FCF yield",
  evToEbit: "EV / EBIT",
  pe: "P/E",
  roic: "ROIC",
  roe: "ROE",
  grossMarginTTM: "Gross margin",
  operatingMarginTTM: "Operating margin",
  netMarginTTM: "Net margin",
  fcfMarginTTM: "FCF margin",
  debtToEquity: "Debt / equity",
  interestCoverage: "Interest coverage",
  revenueGrowthTTM: "Revenue growth (TTM)",
  revenueCagr3y: "Revenue CAGR (3y)",
  priceToBook: "Price / book",
  volatility1y: "Volatility (1y)",
  maxDrawdown1y: "Max drawdown (1y)",
  return1y: "Return (1y, price)",
  beta: "Beta",
  earningsWithin30d: "Earnings within 30 days",
  filings8k30d: "8-K filings (30 days)",
};

/** Fraction as a percent with one decimal: 0.1234 -> "12.3%". */
export function fmtFraction(v: number | null | undefined, decimals = 1): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return `${fmtNumber(v * 100, decimals)}%`;
}

export function fmtMoney(v: number | null | undefined, currency = "USD"): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  const prefix = currency === "USD" ? "$" : `${currency} `;
  return v < 0 ? `−${prefix}${fmtCompact(-v)}` : `${prefix}${fmtCompact(v)}`;
}

/** A metric value formatted for its unit; "—" when null. */
export function fmtMetric(m: ScanMetric | undefined, currency = "USD", key?: ScanMetricKey): string {
  if (!m || m.value === null) return "—";
  const v = m.value;
  if (key === "beta") return fmtNumber(v, 2);
  switch (m.unit) {
    case "money":
      return fmtMoney(v, currency);
    case "per_share":
      return fmtNumber(v, 2);
    case "shares":
      return fmtCompact(v);
    case "fraction":
      return fmtFraction(v);
    case "multiple":
      return `${fmtNumber(v, Math.abs(v) >= 100 ? 0 : 1)}x`;
    case "flag":
      return v === 1 ? "Yes" : "No";
    case "count":
      return fmtNumber(v, 0);
  }
}
