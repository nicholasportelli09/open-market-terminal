/**
 * Pure builders that turn our sourced data into compact context text for the analyst.
 * No network; unit-tested on fixtures. Every line keeps its own date so figures stay traceable.
 */
import type { CompanySnapshot, Metric, MetricKey } from "@/lib/company-types";
import type { Provenance } from "@/lib/provenance";
import type { EconEvent, NewsItem, Quote } from "@/lib/types";

/** Key metrics sent to the model, in this order. */
export const SNAPSHOT_KEYS: readonly MetricKey[] = [
  "marketCap", "enterpriseValue", "revenueTTM", "revenueGrowthTTM", "revenueCagr3y", "grossMarginTTM",
  "operatingMarginTTM", "netMarginTTM", "fcfTTM", "fcfMarginTTM", "netDebt", "epsDilutedTTM", "pe",
  "evToSales", "evToEbit", "fcfYield", "roe", "roic", "debtToEquity",
];

const MAX_HEADLINES = 8;
const MAX_TITLE = 160;

/** 391035000000 -> "391.04B"; small values keep 2 decimals. Deterministic so the model copies exact text. */
export function compactMoney(n: number): string {
  const a = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (a >= 1e12) return `${sign}${(a / 1e12).toFixed(2)}T`;
  if (a >= 1e9) return `${sign}${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${sign}${(a / 1e6).toFixed(2)}M`;
  return `${sign}${a.toFixed(2)}`;
}

export function metricText(m: Metric, currency: string): string {
  if (m.value === null) return `n/a (${m.reason ?? "not available"})`;
  switch (m.unit) {
    case "fraction":
      return `${(m.value * 100).toFixed(2)}%`;
    case "multiple":
      return `${m.value.toFixed(2)}x`;
    case "shares":
      return `${compactMoney(m.value)} shares`;
    case "per_share":
      return `${m.value.toFixed(2)} ${currency}`;
    default:
      return `${compactMoney(m.value)} ${currency}`;
  }
}

function provText(p: Provenance): string {
  return [p.asOf ? `as of ${p.asOf}` : "", p.note ?? ""].filter(Boolean).join(", ");
}

/** Condensed company snapshot: key metrics with formula and filing date, revenue history, caveats. */
export function snapshotContent(s: CompanySnapshot): string {
  const lines = [
    `${s.name} (${s.symbol}), SEC CIK ${s.cik}${s.sicDescription ? `, SIC ${s.sic} ${s.sicDescription}` : ""}. Reporting currency ${s.currency}.`,
    `TTM period ends ${s.ttmPeriodEnd ?? "n/a"}; balance sheet date ${s.balanceSheetDate ?? "n/a"}.`,
    `Price used for ratios: ${metricText(s.price, s.quoteCurrency ?? s.currency)} (${provText(s.price.provenance)}).`,
    "Metrics (name: value | formula | source date):",
    ...SNAPSHOT_KEYS.map((k) => {
      const m = s.metrics[k];
      return `${k}: ${metricText(m, s.currency)}${m.formula ? ` | ${m.formula}` : ""} | ${provText(m.provenance)}`;
    }),
  ];
  const hist = s.revenueHistory.slice(-5);
  if (hist.length) lines.push(`Annual revenue: ${hist.map((p) => `FY${p.fiscalYear} (to ${p.periodEnd}) ${compactMoney(p.value)}`).join("; ")}.`);
  if (s.financialCompany) lines.push("Financial company: debt and EV metrics are not meaningful and are omitted.");
  if (s.currencyMismatch) lines.push("Quote and filings use different currencies: price-based ratios are unavailable.");
  for (const w of s.warnings.slice(0, 4)) lines.push(`Caveat: ${w}`);
  return lines.join("\n");
}

/** Latest-quote line with session and delay status. */
export function quoteLine(q: Quote, session: string, asOf: string): string {
  const pct = q.changePct === null ? "n/a" : `${q.changePct.toFixed(2)}%`;
  const parts = [
    `${q.name} (${q.symbol}) last ${q.last ?? "n/a"}${q.isYield ? "%" : ""}${q.currency ? ` ${q.currency}` : ""}`,
    `change ${q.change ?? "n/a"} (${pct})`,
    `session ${session}`,
    `as of ${asOf || "unknown"}`,
  ];
  if (q.delayed) parts.push("delayed quote");
  if (q.extended?.last != null) {
    const xp = q.extended.changePct === null ? "n/a" : `${q.extended.changePct.toFixed(2)}%`;
    parts.push(`extended hours (${q.extended.type || "ext"}) ${q.extended.last}, ${xp}, at ${q.extended.timeText || q.extended.time || "n/a"}`);
  }
  return `${parts.join("; ")}.`;
}

/** Headlines as "date | publisher | title | link", newest first. */
export function headlinesContent(items: readonly NewsItem[], limit = MAX_HEADLINES): string {
  const rows = [...items]
    .sort((a, b) => b.published.localeCompare(a.published))
    .slice(0, limit)
    .map((n) => `${n.published.slice(0, 10)} | ${n.source} | ${n.title.slice(0, MAX_TITLE)} | ${n.link}`);
  return rows.length ? rows.join("\n") : "No headlines found.";
}

/** Economic calendar rows. Nasdaq's "gmt" field actually holds US Eastern times (8:30 for US releases). */
export function calendarContent(events: readonly EconEvent[], limit = 15): string {
  const rows = events
    .slice(0, limit)
    .map((e) => `${e.time ? `${e.time} ET` : "time n/a"} | ${e.country} | ${e.event} | actual ${e.actual || "n/a"} | consensus ${e.consensus || "n/a"} | previous ${e.previous || "n/a"}`);
  return rows.length ? rows.join("\n") : "No scheduled releases listed for this date.";
}

export type FredLike = { id: string; points: { date: string; value: number }[]; last: { date: string; value: number } } | null;

export const MACRO_SERIES: { id: string; label: string; unit: string }[] = [
  { id: "DGS10", label: "10-year Treasury yield", unit: "%" },
  { id: "DGS2", label: "2-year Treasury yield", unit: "%" },
  { id: "T10Y2Y", label: "10y minus 2y spread", unit: " pp" },
  { id: "BAMLH0A0HYM2", label: "US high-yield option-adjusted spread", unit: " pp" },
  { id: "VIXCLS", label: "VIX close", unit: "" },
  { id: "CPIAUCSL", label: "CPI, all urban consumers (index)", unit: "" },
];

/** Value at or before `date` (YYYY-MM-DD). */
function valueAtOrBefore(points: { date: string; value: number }[], date: string): { date: string; value: number } | null {
  let found: { date: string; value: number } | null = null;
  for (const p of points) {
    if (p.date > date) break;
    found = p;
  }
  return found;
}

function shiftMonths(date: string, months: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + months, d)).toISOString().slice(0, 10);
}

const CPI_LOOKBACK_MONTHS = 3;

/**
 * CPI year-over-year in percent from the monthly index. Uses the newest month (of the last few) that has a
 * value exactly 12 months earlier, so a missing release (e.g. no October 2025 CPI) does not blank the figure.
 */
export function cpiYoY(points: { date: string; value: number }[]): { date: string; pct: number } | null {
  const recent = points.slice(-CPI_LOOKBACK_MONTHS).reverse();
  for (const p of recent) {
    const base = points.find((b) => b.date === shiftMonths(p.date, -12));
    if (base && base.value > 0) return { date: p.date, pct: Math.round((p.value / base.value - 1) * 10_000) / 100 };
  }
  return null;
}

/** One line per series: latest value and date, plus the value about one month and one year earlier. */
export function macroContent(series: Record<string, FredLike>): string {
  const lines: string[] = [];
  for (const { id, label, unit } of MACRO_SERIES) {
    const s = series[id];
    if (!s) {
      lines.push(`${label} (${id}): unavailable.`);
      continue;
    }
    if (id === "CPIAUCSL") {
      const yoy = cpiYoY(s.points);
      lines.push(`CPI inflation year over year (computed from ${id}): ${yoy ? `${yoy.pct}% for ${yoy.date.slice(0, 7)}` : "unavailable"}.`);
      continue;
    }
    const m1 = valueAtOrBefore(s.points, shiftMonths(s.last.date, -1));
    const y1raw = valueAtOrBefore(s.points, shiftMonths(s.last.date, -12));
    const y1 = y1raw && y1raw.date !== m1?.date ? y1raw : null;
    const prior = [m1 ? `${m1.value}${unit} on ${m1.date}` : "", y1 ? `${y1.value}${unit} on ${y1.date}` : ""].filter(Boolean).join("; ");
    lines.push(`${label} (${id}): ${s.last.value}${unit} on ${s.last.date}${prior ? `; earlier ${prior}` : ""}.`);
  }
  return lines.join("\n");
}
