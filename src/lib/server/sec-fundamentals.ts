import type { AnnualPoint, Metric, MetricUnit } from "@/lib/company-types";
import type { Provenance } from "@/lib/provenance";
import { CURRENCY_PROBES, FLOW_CONCEPTS, INSTANT_CONCEPTS, scanLatestEnd, type FlowKey, type InstantKey } from "./sec-concepts";
import {
  buildFlow, conceptFacts, coverShares, daysBetween, filingUrl, instantAt, latestEnd, latestInstantDate,
  ttmAt, ttmYearBefore, type CompanyFactsRaw, type Flow, type PeriodValue, type Ttm,
} from "./sec-facts";

/**
 * Turns raw companyfacts into sourced base figures (TTM flows, balance sheet, shares, revenue history).
 * Pure: no network, no clock (the caller passes today's date). Ratios built on top live in company-metrics.ts.
 */

export const BASE_KEYS = [
  "revenueTTM", "revenuePriorTTM", "grossProfitTTM", "operatingIncomeTTM", "netIncomeTTM", "epsDilutedTTM",
  "operatingCashFlowTTM", "capexTTM", "depreciationAmortizationTTM", "interestExpenseTTM", "incomeTaxTTM",
  "pretaxIncomeTTM", "cash", "totalDebt", "equity", "sharesOutstanding",
] as const;
export type BaseKey = (typeof BASE_KEYS)[number];

export type SecBase = {
  cik: string;
  name: string;
  currency: string;
  ttmEnd: string | null;
  balanceSheetDate: string | null;
  values: Record<BaseKey, Metric>;
  revenueHistory: AnnualPoint[];
  warnings: string[];
};

export type NormalizeResult = { kind: "ok"; base: SecBase } | { kind: "unsupported"; reason: string };

const HISTORY_YEARS = 10;
/** A share count older than this (vs the balance sheet date) is treated as stale. */
const SHARES_MAX_AGE_DAYS = 120;
const SHARES_SANITY = { min: 0.5, max: 2 };
/** Latest US GAAP period older than this (about 18 months) means the filer no longer reports in US GAAP. */
const STALE_TTM_DAYS = 548;

const TTM_KEYS: [FlowKey, BaseKey, string, MetricUnit][] = [
  ["revenue", "revenueTTM", "Revenue", "money"],
  ["operatingIncome", "operatingIncomeTTM", "Operating income (EBIT)", "money"],
  ["netIncome", "netIncomeTTM", "Net income", "money"],
  ["epsDiluted", "epsDilutedTTM", "Diluted EPS", "per_share"],
  ["operatingCashFlow", "operatingCashFlowTTM", "Operating cash flow", "money"],
  ["capex", "capexTTM", "Capital expenditure", "money"],
  ["depreciationAmortization", "depreciationAmortizationTTM", "Depreciation and amortization", "money"],
  ["interestExpense", "interestExpenseTTM", "Interest expense", "money"],
  ["incomeTax", "incomeTaxTTM", "Income tax expense", "money"],
  ["pretaxIncome", "pretaxIncomeTTM", "Pre-tax income", "money"],
];

export function padCik(cik: number | string): string {
  return String(Number(cik)).padStart(10, "0");
}

/** The ISO currency most us-gaap monetary facts are reported in, or null when there is none. */
export function reportingCurrency(facts: CompanyFactsRaw): string | null {
  const gaap = facts.facts["us-gaap"];
  if (!gaap) return null;
  const counts = new Map<string, number>();
  for (const concept of CURRENCY_PROBES) {
    for (const [unit, list] of Object.entries(gaap[concept]?.units ?? {})) {
      if (/^[A-Z]{3}$/.test(unit)) counts.set(unit, (counts.get(unit) ?? 0) + list.length);
    }
  }
  let best: string | null = null;
  for (const [unit, n] of counts) if (!best || n > (counts.get(best) ?? 0)) best = unit;
  return best;
}

export function missing(unit: MetricUnit, formula: string, reason: string, asOf: string | null, source: Provenance["source"] = "sec"): Metric {
  return { value: null, unit, formula, reason, provenance: { source, asOf: asOf ?? "" } };
}

function ttmNote(ttm: Ttm): string {
  const last = ttm.pieces[ttm.pieces.length - 1];
  if (ttm.basis === "annual") return `FY${last.fiscalYear ?? ttm.end.slice(0, 4)} (${last.form})`;
  const derived = ttm.pieces.filter((p) => p.derived).map((p) => p.end);
  const extra = derived.length ? `; quarter(s) to ${derived.join(", ")} derived from cumulative filings` : "";
  return `TTM to ${ttm.end} (${last.form})${extra}`;
}

function ttmMetric(cik: string, ttm: Ttm, label: string, unit: MetricUnit, concept: string): Metric {
  const last = ttm.pieces[ttm.pieces.length - 1];
  const how = ttm.basis === "annual" ? "latest fiscal year" : "sum of last 4 quarters";
  return {
    value: ttm.value,
    unit,
    formula: `${label} TTM = us-gaap:${concept}, ${how}`,
    provenance: { source: "sec", asOf: ttm.end, url: filingUrl(cik, last.accn), note: `${ttmNote(ttm)}, us-gaap:${concept}` },
  };
}

/** First concept (priority order) that has a complete TTM ending exactly at `end`. */
function pickTtm(facts: CompanyFactsRaw, key: FlowKey, unit: string, end: string): { flow: Flow; ttm: Ttm } | null {
  for (const concept of FLOW_CONCEPTS[key]) {
    const flow = buildFlow(conceptFacts(facts, "us-gaap", concept, unit), concept);
    const ttm = ttmAt(flow, end);
    if (ttm) return { flow, ttm };
  }
  return null;
}

function flowUnit(key: FlowKey, currency: string): string {
  return key === "epsDiluted" ? `${currency}/shares` : currency;
}

/** Latest period end reported for revenue or net income, across all fallback concepts. */
function referenceEnd(facts: CompanyFactsRaw, currency: string): string | null {
  let best = "";
  for (const concept of [...FLOW_CONCEPTS.revenue, ...FLOW_CONCEPTS.netIncome]) {
    const end = latestEnd(buildFlow(conceptFacts(facts, "us-gaap", concept, currency), concept));
    if (end && end > best) best = end;
  }
  return best || null;
}

/** One point per fiscal period end: concepts are merged in priority order, so one period never appears twice. */
function revenueHistory(facts: CompanyFactsRaw, cik: string, currency: string, preferred: string | null): AnnualPoint[] {
  const order = preferred ? [preferred, ...FLOW_CONCEPTS.revenue.filter((c) => c !== preferred)] : [...FLOW_CONCEPTS.revenue];
  const byEnd = new Map<string, AnnualPoint>();
  for (const concept of order) {
    const flow = buildFlow(conceptFacts(facts, "us-gaap", concept, currency), concept);
    for (const a of flow.annual) {
      if (byEnd.has(a.end)) continue;
      const fy = a.fiscalYear ?? Number(a.end.slice(0, 4));
      byEnd.set(a.end, {
        fiscalYear: fy,
        periodEnd: a.end,
        value: a.value,
        provenance: { source: "sec", asOf: a.end, url: filingUrl(cik, a.accn), note: `FY${fy} (${a.form}), us-gaap:${concept}` },
      });
    }
  }
  // Labels are unique per company; should two period ends still share one (e.g. a transition year), keep the later.
  const byYear = new Map<number, AnnualPoint>();
  for (const p of [...byEnd.values()].sort((a, b) => (a.periodEnd < b.periodEnd ? -1 : 1))) byYear.set(p.fiscalYear, p);
  return [...byYear.values()].slice(-HISTORY_YEARS);
}

function instant(facts: CompanyFactsRaw, key: InstantKey, currency: string, date: string): PeriodValue | null {
  for (const concept of INSTANT_CONCEPTS[key]) {
    const hit = instantAt(conceptFacts(facts, "us-gaap", concept, currency), concept, date);
    if (hit) return hit;
  }
  return null;
}

function instantMetric(cik: string, parts: PeriodValue[], label: string, date: string): Metric {
  const value = parts.reduce((s, p) => s + p.value, 0);
  const names = parts.map((p) => `us-gaap:${p.concept}`).join(" + ");
  const filing = parts.reduce((a, b) => (b.filed > a.filed ? b : a));
  return {
    value,
    unit: "money",
    formula: `${label} = ${names}`,
    provenance: { source: "sec", asOf: date, url: filingUrl(cik, filing.accn), note: `Balance sheet ${date} (${filing.form})` },
  };
}

/** Total debt from its tagged parts; null with a reason when only part of the long-term debt is tagged. */
function totalDebt(facts: CompanyFactsRaw, cik: string, currency: string, date: string, warnings: string[]): Metric {
  const label = "Total debt";
  const ltTotal = instant(facts, "longTermDebtTotal", currency, date);
  const ltNon = instant(facts, "longTermDebtNoncurrent", currency, date);
  const ltCur = instant(facts, "longTermDebtCurrent", currency, date);
  const [cp, stb] = INSTANT_CONCEPTS.shortTermDebt.map((c) => instantAt(conceptFacts(facts, "us-gaap", c, currency), c, date));
  if (!ltTotal && !ltNon) {
    if (!ltCur) return missing("money", label, `No debt figure tagged for ${date}`, date);
    return missing("money", label, `Only the current portion of long-term debt is tagged for ${date}; the non-current part is not, so total debt would be understated`, date);
  }
  // Commercial paper is often a component of short-term borrowings, so the two are never added together.
  const st = cp ?? stb;
  if (cp && stb && cp.value !== stb.value) {
    warnings.push(`Both commercial paper and short-term borrowings are tagged for ${date}; only commercial paper is counted in total debt (they may overlap), so debt may be understated.`);
  }
  const lt = ltTotal ? [ltTotal] : [ltNon, ltCur].filter((p): p is PeriodValue => !!p);
  return instantMetric(cik, [...lt, ...(st ? [st] : [])], label, date);
}

function balanceSheet(facts: CompanyFactsRaw, cik: string, currency: string, warnings: string[]): { date: string | null; cash: Metric; totalDebt: Metric; equity: Metric } {
  const equityFacts = INSTANT_CONCEPTS.equity.map((c) => conceptFacts(facts, "us-gaap", c, currency)).find((l) => l.length);
  const date = equityFacts ? latestInstantDate(equityFacts) : null;
  if (!date) {
    const none = (label: string) => missing("money", label, "No balance sheet in SEC filings", null);
    return { date: null, cash: none("Cash"), totalDebt: none("Total debt"), equity: none("Equity") };
  }
  const eq = instant(facts, "equity", currency, date);
  const cash = instant(facts, "cash", currency, date);
  const sti = instant(facts, "shortTermInvestments", currency, date);
  return {
    date,
    equity: eq ? instantMetric(cik, [eq], "Shareholders' equity", date) : missing("money", "Shareholders' equity", "Not reported", date),
    cash: cash
      ? instantMetric(cik, [cash, ...(sti ? [sti] : [])], "Cash and short-term investments", date)
      : missing("money", "Cash and short-term investments", `No cash figure for ${date}`, date),
    totalDebt: totalDebt(facts, cik, currency, date, warnings),
  };
}

function shares(facts: CompanyFactsRaw, cik: string, bsDate: string | null, warnings: string[]): Metric {
  const label = "Shares outstanding";
  const cover = coverShares(conceptFacts(facts, "dei", "EntityCommonStockSharesOutstanding", "shares"));
  const wad = conceptFacts(facts, "us-gaap", "WeightedAverageNumberOfDilutedSharesOutstanding", "shares")
    .filter((p) => p.start && daysBetween(p.start, p.end) <= 380)
    .sort((a, b) => (a.end === b.end ? daysBetween(a.start as string, a.end) - daysBetween(b.start as string, b.end) : a.end > b.end ? -1 : 1))[0];
  const fresh = (end: string) => !bsDate || daysBetween(bsDate, end) >= -SHARES_MAX_AGE_DAYS;

  if (cover && fresh(cover.end)) {
    if (wad && fresh(wad.end)) {
      const ratio = cover.value / wad.val;
      if (ratio < SHARES_SANITY.min || ratio > SHARES_SANITY.max) {
        warnings.push("Cover-page share count disagrees with diluted weighted shares (share classes with different economics?); share count withheld.");
        return missing("shares", label, "Share classes could not be reconciled", cover.end);
      }
    }
    const classes = cover.classes > 1 ? `, sum of ${cover.classes} share classes` : "";
    return {
      value: cover.value,
      unit: "shares",
      formula: `${label} = dei:EntityCommonStockSharesOutstanding (cover page${classes})`,
      provenance: { source: "sec", asOf: cover.end, url: filingUrl(cik, cover.accn), note: `Cover page of ${cover.form} filed ${cover.filed}` },
    };
  }
  if (wad && fresh(wad.end)) {
    warnings.push("No current cover-page share count in XBRL; using diluted weighted-average shares for the latest period.");
    return {
      value: wad.val,
      unit: "shares",
      formula: `${label} ~ us-gaap:WeightedAverageNumberOfDilutedSharesOutstanding (period ${wad.start} to ${wad.end})`,
      provenance: { source: "sec", asOf: wad.end, url: filingUrl(cik, wad.accn), note: `Diluted weighted average, ${wad.form}` },
    };
  }
  return missing("shares", label, "No current share count in SEC XBRL data", cover?.end ?? null);
}

/** Latest period end of any fact in a taxonomy (recorded before trimming when available). */
function taxonomyLatestEnd(facts: CompanyFactsRaw, taxonomy: string): string | null {
  return facts.latestEnds?.[taxonomy] ?? scanLatestEnd(facts.facts[taxonomy]);
}

/** Why the latest US GAAP figures cannot be shown as current, or null when they can. */
function staleReason(facts: CompanyFactsRaw, ttmEnd: string, today: string | undefined): string | null {
  const ifrsEnd = taxonomyLatestEnd(facts, "ifrs-full");
  if (ifrsEnd && ifrsEnd > ttmEnd) {
    return `${facts.entityName} moved to IFRS (ifrs-full data runs to ${ifrsEnd}; US GAAP data ends ${ttmEnd}); only US GAAP filers are supported.`;
  }
  if (today && daysBetween(ttmEnd, today) > STALE_TTM_DAYS) {
    return `${facts.entityName}'s latest US GAAP figures are for the period to ${ttmEnd}, more than 18 months ago; there are no current figures to show.`;
  }
  return null;
}

/** `today` (YYYY-MM-DD) enables the staleness check; callers serving live data must pass it. */
export function normalizeFundamentals(facts: CompanyFactsRaw, today?: string): NormalizeResult {
  const currency = reportingCurrency(facts);
  if (!currency) {
    const ifrs = !!facts.facts["ifrs-full"];
    return {
      kind: "unsupported",
      reason: ifrs
        ? `${facts.entityName} reports under IFRS (ifrs-full taxonomy); only US GAAP filers are supported.`
        : `${facts.entityName} has no US GAAP financial statements in SEC XBRL data.`,
    };
  }
  const cik = padCik(facts.cik);
  const ttmEnd = referenceEnd(facts, currency);
  if (!ttmEnd) return { kind: "unsupported", reason: `${facts.entityName} has no revenue or net income facts in SEC XBRL data.` };
  const stale = staleReason(facts, ttmEnd, today);
  if (stale) return { kind: "unsupported", reason: stale };

  const warnings: string[] = [];
  const values = {} as Record<BaseKey, Metric>;
  let revenueFlow: { flow: Flow; ttm: Ttm } | null = null;
  for (const [key, base, label, unit] of TTM_KEYS) {
    const hit = pickTtm(facts, key, flowUnit(key, currency), ttmEnd);
    if (key === "revenue") revenueFlow = hit;
    values[base] = hit
      ? ttmMetric(cik, hit.ttm, label, unit, hit.flow.concept)
      : missing(unit, `${label} TTM`, `No complete ${label.toLowerCase()} figures for the 12 months to ${ttmEnd}`, ttmEnd);
  }
  if (values.epsDilutedTTM.value !== null && values.epsDilutedTTM.provenance.note?.startsWith("TTM")) {
    values.epsDilutedTTM = { ...values.epsDilutedTTM, formula: `${values.epsDilutedTTM.formula} (quarterly EPS summed)` };
  }

  const prior = revenueFlow ? ttmYearBefore(revenueFlow.flow, revenueFlow.ttm) : null;
  values.revenuePriorTTM = prior && revenueFlow
    ? ttmMetric(cik, prior, "Revenue (prior year)", "money", revenueFlow.flow.concept)
    : missing("money", "Revenue TTM one year earlier", "Prior-year trailing revenue not available", ttmEnd);

  const gp = pickTtm(facts, "grossProfit", currency, ttmEnd);
  const cost = gp ? null : pickTtm(facts, "costOfRevenue", currency, ttmEnd);
  if (gp) values.grossProfitTTM = ttmMetric(cik, gp.ttm, "Gross profit", "money", gp.flow.concept);
  else if (cost && revenueFlow && values.revenueTTM.value !== null) {
    values.grossProfitTTM = {
      value: values.revenueTTM.value - cost.ttm.value,
      unit: "money",
      formula: `Gross profit TTM = revenue TTM - us-gaap:${cost.flow.concept} TTM`,
      provenance: { source: "model", asOf: ttmEnd, note: `Inputs: revenue (${values.revenueTTM.provenance.note}), cost of revenue (${ttmNote(cost.ttm)})` },
    };
  } else values.grossProfitTTM = missing("money", "Gross profit TTM", "Gross profit and cost of revenue not reported", ttmEnd);

  const bs = balanceSheet(facts, cik, currency, warnings);
  values.cash = bs.cash;
  values.totalDebt = bs.totalDebt;
  values.equity = bs.equity;
  values.sharesOutstanding = shares(facts, cik, bs.date, warnings);
  if (values.revenueTTM.value === null) warnings.push(`No complete revenue figures for the 12 months to ${ttmEnd}.`);

  return {
    kind: "ok",
    base: {
      cik,
      name: facts.entityName,
      currency,
      ttmEnd,
      balanceSheetDate: bs.date,
      values,
      revenueHistory: revenueHistory(facts, cik, currency, revenueFlow?.flow.concept ?? null),
      warnings,
    },
  };
}
