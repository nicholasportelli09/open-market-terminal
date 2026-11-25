/**
 * Context documents (S1..S3) for the thesis: the screen row's sourced metrics, risk inputs and catalysts,
 * as compact text with provenance so the model can cite them and copy figures exactly.
 */
import type { CompanySnapshot } from "@/lib/company-types";
import type { Provenance } from "@/lib/provenance";
import type { ScanMetric, ScanMetricKey, ScreenRow } from "@/lib/scanner/types";
import type { ContextDoc } from "../ai/parse";

const RISK_KEYS: readonly ScanMetricKey[] = ["volatility1y", "maxDrawdown1y", "return1y", "beta"];
const SKIP_IN_SNAPSHOT = new Set<ScanMetricKey>([...RISK_KEYS, "earningsWithin30d", "filings8k30d"]);

function prov(p: Provenance): string {
  return [p.source, p.asOf && `as of ${p.asOf}`, p.session && p.session !== "n/a" && `session ${p.session}`, p.note].filter(Boolean).join(", ");
}

function metricLine(key: string, m: ScanMetric, currency: string): string {
  if (m.value === null) return `${key}: not available (${m.reason ?? "missing"})`;
  const unit = m.unit === "money" || m.unit === "per_share" ? ` ${currency}` : m.unit === "fraction" ? " (fraction, 0.25 = 25%)" : m.unit === "multiple" ? "x" : "";
  return `${key}: ${m.value}${unit} | ${m.formula} | ${prov(m.provenance)}`;
}

export function thesisContext(row: ScreenRow, snapshot: CompanySnapshot): ContextDoc[] {
  const fundamentals = (Object.entries(row.metrics) as [ScanMetricKey, ScanMetric][])
    .filter(([k]) => !SKIP_IN_SNAPSHOT.has(k))
    .map(([k, m]) => metricLine(k, m, row.currency));
  const history = snapshot.revenueHistory.map((p) => `FY${p.fiscalYear} (period end ${p.periodEnd}): ${p.value} ${row.currency}`);
  const s1: ContextDoc = {
    id: "S1",
    title: `${row.name} (${row.symbol}) company snapshot from SEC filings and CNBC price`,
    provenance: { source: "sec", asOf: row.ttmPeriodEnd ?? "", note: `TTM to ${row.ttmPeriodEnd ?? "n/a"}` },
    content: [
      `Company: ${row.name}, ticker ${row.symbol}, SEC CIK ${row.cik}, SIC ${row.sic ?? "n/a"} ${row.sicDescription ?? ""}.`,
      `Reporting currency: ${row.currency}. Bank or insurer: ${row.financialCompany ? "yes" : "no"}.`,
      metricLine("price", row.price, row.currency),
      ...fundamentals,
      history.length ? `Annual revenue (10-K): ${history.join("; ")}` : "Annual revenue history: not available",
      ...row.warnings.map((w) => `Data caveat: ${w}`),
    ].join("\n"),
  };
  const s2: ContextDoc = {
    id: "S2",
    title: `${row.symbol} 1-year price risk inputs (CNBC daily closes and beta)`,
    provenance: row.metrics.volatility1y.provenance,
    content: RISK_KEYS.map((k) => metricLine(k, row.metrics[k], row.currency)).join("\n"),
  };
  const events = row.catalysts.map(
    (c) => `${c.date}: ${c.label}${c.estimated ? " (estimated date)" : ""}${c.detail ? ` - ${c.detail}` : ""} | ${prov(c.provenance)}${c.provenance.url ? ` | ${c.provenance.url}` : ""}`,
  );
  const s3: ContextDoc = {
    id: "S3",
    title: `${row.symbol} dated catalysts: upcoming CNBC calendar events and SEC 8-K filings of the last 30 days`,
    provenance: { source: "sec", asOf: row.metrics.filings8k30d.provenance.asOf },
    content: events.length ? events.join("\n") : "No dated catalysts found in the CNBC calendar or recent 8-K filings.",
  };
  return [s1, s2, s3];
}
