import type { AnnualPoint, CompanySnapshot, Metric, MetricKey, MetricUnit } from "@/lib/company-types";
import type { Provenance } from "@/lib/provenance";
import { quoteProvenance } from "@/lib/market-session";
import { daysBetween } from "./sec-facts";
import { missing, type SecBase } from "./sec-fundamentals";

/**
 * Pure derivation of the company snapshot from SEC base figures plus a CNBC quote. Every derived value
 * is source "model" and lists its inputs; a missing or unusable input gives null with a reason.
 */

export type QuoteInput = {
  symbol: string;
  last: number | null;
  currency: string;
  marketStatus: string;
  time: string | null;
  timeText: string;
  /** CNBC issue type (STOCK, ETF, ...); defaults to STOCK for session rules. */
  type?: string;
  exchange?: string;
  /** True when CNBC marks the quote as not real-time. */
  delayed?: boolean;
};

export type ProfileInput = {
  sic: string | null;
  sicDescription: string | null;
  fiscalYearEnd: string | null;
  exchanges: string[];
};

const FINANCIAL_SIC = { min: 6000, max: 6499 };
const CAGR_YEARS = 3;
const CAGR_DAYS = 1_095;
const CAGR_TOLERANCE_DAYS = 15;

type Inputs = Record<string, Metric>;
type Gate = string | null;

function describe(name: string, m: Metric): string {
  const p = m.provenance;
  // Derived inputs carry their own inputs; repeating them here would nest notes without end.
  if (p.source === "model") return `${name}: derived`;
  return `${name}: ${p.source.toUpperCase()} ${p.note ?? p.asOf}`;
}

function latestAsOf(inputs: Inputs): string {
  return Object.values(inputs).reduce((best, m) => (m.provenance.asOf > best ? m.provenance.asOf : best), "");
}

/** Computes a model metric; `fn` returns a number, or a string explaining why there is no value. */
function calc(unit: MetricUnit, formula: string, inputs: Inputs, fn: (v: Record<string, number>) => number | string, gate: Gate = null): Metric {
  const asOf = latestAsOf(inputs);
  if (gate) return missing(unit, formula, gate, asOf, "model");
  const values: Record<string, number> = {};
  for (const [name, m] of Object.entries(inputs)) {
    if (m.value === null) return missing(unit, formula, `Missing input: ${name}${m.reason ? ` (${m.reason})` : ""}`, asOf, "model");
    values[name] = m.value;
  }
  const out = fn(values);
  if (typeof out === "string") return missing(unit, formula, out, asOf, "model");
  if (!Number.isFinite(out)) return missing(unit, formula, "Not computable", asOf, "model");
  const note = Object.entries(inputs).map(([name, m]) => describe(name, m)).join("; ");
  return { value: out, unit, formula, provenance: { source: "model", asOf, note: `Inputs: ${note}` } };
}

const positive = (n: number, what: string): string | null => (n > 0 ? null : `${what} is zero or negative`);

export function priceMetric(q: QuoteInput | null, now: Date = new Date()): Metric {
  const formula = "Last regular-session price (extended-hours prices are not used)";
  if (!q || q.last === null) return missing("per_share", formula, "No quote from CNBC", null, "cnbc");
  const stamped = quoteProvenance({ symbol: q.symbol, type: q.type ?? "STOCK", exchange: q.exchange, country: "US", time: q.time, delayed: q.delayed }, now);
  const provenance: Provenance = {
    ...stamped,
    asOf: stamped.asOf || q.time || q.timeText,
    url: `https://www.cnbc.com/quotes/${encodeURIComponent(q.symbol)}`,
    note: q.timeText || undefined,
  };
  return { value: q.last, unit: "per_share", formula, provenance };
}

function revenueCagr(history: AnnualPoint[]): Metric {
  const formula = `Revenue CAGR ${CAGR_YEARS}y = (FY revenue / FY revenue ${CAGR_YEARS} years earlier)^(1/${CAGR_YEARS}) - 1`;
  const last = history.at(-1);
  // Matched by period end (labels can be off by one for January year ends); 52/53-week years drift a few days.
  const first = last ? history.find((p) => Math.abs(daysBetween(p.periodEnd, last.periodEnd) - CAGR_DAYS) <= CAGR_TOLERANCE_DAYS) : undefined;
  if (!last || !first) return missing("fraction", formula, `Needs ${CAGR_YEARS + 1} fiscal years of revenue`, last?.periodEnd ?? null, "model");
  const asMetric = (p: AnnualPoint): Metric => ({ value: p.value, unit: "money", formula: "", provenance: p.provenance });
  const [lastKey, firstKey] = [`FY${last.fiscalYear} (to ${last.periodEnd})`, `FY${first.fiscalYear} (to ${first.periodEnd})`];
  return calc("fraction", formula, { [lastKey]: asMetric(last), [firstKey]: asMetric(first) }, (v) => {
    const a = v[firstKey];
    const b = v[lastKey];
    return a > 0 && b > 0 ? (b / a) ** (1 / CAGR_YEARS) - 1 : "Revenue is zero or negative";
  });
}

export function isFinancialSic(sic: string | null): boolean {
  const n = Number(sic);
  return Number.isFinite(n) && n >= FINANCIAL_SIC.min && n <= FINANCIAL_SIC.max;
}

export function buildSnapshot(symbol: string, base: SecBase, profile: ProfileInput | null, quote: QuoteInput | null, now: Date = new Date()): CompanySnapshot {
  const b = base.values;
  const price = priceMetric(quote, now);
  const quoteCurrency = quote ? quote.currency : null;
  const currencyMismatch = !!quoteCurrency && quoteCurrency !== base.currency;
  const financial = isFinancialSic(profile?.sic ?? null);
  const warnings = [...base.warnings];
  const priceGate: Gate = currencyMismatch
    ? `Quote is in ${quoteCurrency} but filings are in ${base.currency}; price-based figures are withheld`
    : null;
  const finGate: Gate = financial ? "Not meaningful for banks and insurers (debt is part of operations)" : null;
  if (currencyMismatch) warnings.push(priceGate as string);
  if (financial) warnings.push("Financial company: net debt, EV and leverage metrics are not shown.");
  if (!profile) warnings.push("SEC company profile unavailable: sector unknown, so the bank and insurer check was not applied to EV and leverage metrics.");

  const marketCap = calc("money", "Market cap = price x shares outstanding", { price, shares: b.sharesOutstanding }, (v) => v.price * v.shares, priceGate);
  const netDebt = calc("money", "Net debt = total debt - cash and short-term investments", { debt: b.totalDebt, cash: b.cash }, (v) => v.debt - v.cash, finGate);
  const enterpriseValue = calc("money", "EV = market cap + net debt", { marketCap, netDebt }, (v) => v.marketCap + v.netDebt, priceGate ?? finGate);
  const fcfTTM = calc("money", "FCF TTM = operating cash flow - capex", { ocf: b.operatingCashFlowTTM, capex: b.capexTTM }, (v) => v.ocf - v.capex);
  const ebitdaTTM = calc("money", "EBITDA TTM = operating income + D&A", { ebit: b.operatingIncomeTTM, da: b.depreciationAmortizationTTM }, (v) => v.ebit + v.da);
  const effectiveTaxRate = calc("fraction", "Effective tax rate = income tax / pre-tax income (TTM)", { tax: b.incomeTaxTTM, pretax: b.pretaxIncomeTTM }, (v) =>
    positive(v.pretax, "Pre-tax income") ?? v.tax / v.pretax);
  const margin = (name: string, m: Metric) =>
    calc("fraction", `${name} margin TTM = ${name.toLowerCase()} / revenue`, { [name]: m, revenue: b.revenueTTM }, (v) =>
      positive(v.revenue, "Revenue") ?? v[name] / v.revenue);
  const multiple = (formula: string, num: Metric, numName: string, den: Metric, denName: string) =>
    calc("multiple", formula, { [numName]: num, [denName]: den }, (v) => positive(v[denName], denName) ?? v[numName] / v[denName]);

  const metrics: Record<MetricKey, Metric> = {
    sharesOutstanding: b.sharesOutstanding,
    marketCap,
    cash: b.cash,
    totalDebt: b.totalDebt,
    netDebt,
    enterpriseValue,
    equity: b.equity,
    revenueTTM: b.revenueTTM,
    grossProfitTTM: b.grossProfitTTM,
    operatingIncomeTTM: b.operatingIncomeTTM,
    netIncomeTTM: b.netIncomeTTM,
    epsDilutedTTM: b.epsDilutedTTM,
    operatingCashFlowTTM: b.operatingCashFlowTTM,
    capexTTM: b.capexTTM,
    fcfTTM,
    ebitdaTTM,
    revenueGrowthTTM: calc("fraction", "Revenue growth = revenue TTM / revenue TTM a year earlier - 1", { revenue: b.revenueTTM, prior: b.revenuePriorTTM }, (v) =>
      positive(v.prior, "Prior-year revenue") ?? v.revenue / v.prior - 1),
    revenueCagr3y: revenueCagr(base.revenueHistory),
    grossMarginTTM: margin("Gross", b.grossProfitTTM),
    operatingMarginTTM: margin("Operating", b.operatingIncomeTTM),
    netMarginTTM: margin("Net", b.netIncomeTTM),
    fcfMarginTTM: margin("FCF", fcfTTM),
    pe: calc("multiple", "P/E = price / diluted EPS TTM (null when EPS <= 0)", { price, eps: b.epsDilutedTTM }, (v) =>
      positive(v.eps, "EPS TTM") ?? v.price / v.eps, priceGate),
    evToSales: multiple("EV/Sales = EV / revenue TTM", enterpriseValue, "ev", b.revenueTTM, "revenue"),
    evToEbit: multiple("EV/EBIT = EV / operating income TTM", enterpriseValue, "ev", b.operatingIncomeTTM, "ebit"),
    evToEbitda: multiple("EV/EBITDA = EV / EBITDA TTM", enterpriseValue, "ev", ebitdaTTM, "ebitda"),
    priceToFcf: multiple("P/FCF = market cap / FCF TTM", marketCap, "marketCap", fcfTTM, "fcf"),
    fcfYield: calc("fraction", "FCF yield = FCF TTM / market cap", { fcf: fcfTTM, marketCap }, (v) => positive(v.marketCap, "Market cap") ?? v.fcf / v.marketCap),
    roe: calc("fraction", "ROE = net income TTM / ending shareholders' equity", { netIncome: b.netIncomeTTM, equity: b.equity }, (v) =>
      positive(v.equity, "Equity") ?? v.netIncome / v.equity),
    roic: calc("fraction", "ROIC (approx) = EBIT TTM x (1 - effective tax rate) / (total debt + equity - cash), ending balances", {
      ebit: b.operatingIncomeTTM, taxRate: effectiveTaxRate, debt: b.totalDebt, equity: b.equity, cash: b.cash,
    }, (v) => {
      const invested = v.debt + v.equity - v.cash;
      return positive(invested, "Invested capital") ?? (v.ebit * (1 - v.taxRate)) / invested;
    }, finGate),
    debtToEquity: calc("multiple", "Debt/Equity = total debt / shareholders' equity", { debt: b.totalDebt, equity: b.equity }, (v) =>
      positive(v.equity, "Equity") ?? v.debt / v.equity, finGate),
    interestCoverage: calc("multiple", "Interest coverage = operating income TTM / interest expense TTM", { ebit: b.operatingIncomeTTM, interest: b.interestExpenseTTM }, (v) =>
      positive(v.interest, "Interest expense") ?? v.ebit / v.interest, finGate),
    effectiveTaxRate,
  };

  return {
    symbol,
    cik: base.cik,
    name: base.name,
    sic: profile?.sic ?? null,
    sicDescription: profile?.sicDescription ?? null,
    fiscalYearEnd: profile?.fiscalYearEnd ?? null,
    exchanges: profile?.exchanges ?? [],
    currency: base.currency,
    quoteCurrency,
    currencyMismatch,
    financialCompany: financial,
    price,
    metrics,
    revenueHistory: base.revenueHistory,
    ttmPeriodEnd: base.ttmEnd,
    balanceSheetDate: base.balanceSheetDate,
    warnings,
  };
}
