/**
 * Pure catalyst extraction: dated upcoming events from a CNBC quote's EventData, and recent 8-K filings
 * from SEC submissions. No network.
 */
import type { Catalyst, ScanMetric } from "@/lib/scanner/types";
import type { Provenance } from "@/lib/provenance";

export const CATALYST_WINDOW_DAYS = 30;
const DAY_MS = 86_400_000;

/** SEC Form 8-K item numbers (https://www.sec.gov/files/form8-k.pdf). */
const ITEM_LABELS: Record<string, string> = {
  "1.01": "Material agreement", "1.02": "Agreement terminated", "1.03": "Bankruptcy", "1.05": "Cybersecurity incident",
  "2.01": "Acquisition or disposition", "2.02": "Results of operations", "2.03": "New financial obligation",
  "2.04": "Obligation accelerated", "2.05": "Exit or restructuring costs", "2.06": "Material impairment",
  "3.01": "Listing notice", "3.02": "Unregistered equity sale", "3.03": "Change to holders' rights",
  "4.01": "Auditor change", "4.02": "Prior financials not to be relied on", "5.01": "Change in control",
  "5.02": "Director or officer change", "5.03": "Bylaw or fiscal year change", "5.05": "Code of ethics change",
  "5.07": "Shareholder vote results", "5.08": "Shareholder nominations", "7.01": "Regulation FD disclosure",
  "8.01": "Other events", "9.01": "Financial statements and exhibits",
};

/** "01/27/2027(est)" -> { date: "2027-01-27", estimated: true }; null when unparseable. */
export function parseCnbcDate(raw: string | undefined): { date: string; estimated: boolean } | null {
  const m = raw?.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s*(\(est\))?$/i);
  if (!m) return null;
  const [, mm, dd, yyyy, est] = m;
  const date = `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  return Number.isFinite(Date.parse(`${date}T00:00:00Z`)) ? { date, estimated: !!est } : null;
}

/** Whole days from `today` (YYYY-MM-DD) to `date` (YYYY-MM-DD); negative when in the past. */
export function daysFrom(today: string, date: string): number {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY_MS);
}

export function itemLabels(items: string): string[] {
  return items
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s && s !== "9.01")
    .map((s) => ITEM_LABELS[s] ?? `Item ${s}`);
}

export type QuoteEvents = Record<string, string>;

/** Next earnings and ex-dividend dates from CNBC EventData. Past dates are dropped (stale feed values). */
export function quoteCatalysts(events: QuoteEvents, today: string, provenance: Provenance): Catalyst[] {
  const out: Catalyst[] = [];
  const earnings = parseCnbcDate(events.next_earnings_date);
  if (earnings && daysFrom(today, earnings.date) >= 0) {
    const when = events.announce_time === "B" ? "before the open" : events.announce_time === "A" ? "after the close" : "";
    out.push({
      kind: "earnings",
      date: earnings.date,
      label: "Next earnings", // the estimated flag is shown as its own chip
      detail: when || undefined,
      estimated: earnings.estimated,
      upcoming: true,
      provenance: { ...provenance, note: "CNBC event calendar" },
    });
  }
  const exDiv = parseCnbcDate(events.div_ex_date);
  if (exDiv && daysFrom(today, exDiv.date) >= 0) {
    const amount = events.div_amount?.trim();
    out.push({
      kind: "ex_dividend",
      date: exDiv.date,
      label: "Ex-dividend date",
      detail: amount ? `Dividend ${amount} per share` : undefined,
      upcoming: true,
      provenance: { ...provenance, note: "CNBC event calendar" },
    });
  }
  return out;
}

export type Filing = { form: string; filingDate: string; accessionNumber: string; primaryDocument: string; items: string };

/** Archive link for one filing's primary document. */
export function filingDocUrl(cik: string, f: Filing): string {
  const acc = f.accessionNumber.replace(/-/g, "");
  const base = `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${acc}`;
  return f.primaryDocument ? `${base}/${f.primaryDocument}` : `${base}/`;
}

/** 8-K and 8-K/A filings dated within the last CATALYST_WINDOW_DAYS, newest first. */
export function recent8ks(filings: readonly Filing[], cik: string, today: string): Catalyst[] {
  return filings
    .filter((f) => (f.form === "8-K" || f.form === "8-K/A") && daysFrom(f.filingDate, today) <= CATALYST_WINDOW_DAYS && daysFrom(f.filingDate, today) >= 0)
    .sort((a, b) => b.filingDate.localeCompare(a.filingDate))
    .map((f) => {
      const labels = itemLabels(f.items);
      return {
        kind: "filing_8k" as const,
        date: f.filingDate,
        label: f.form === "8-K/A" ? "8-K amendment filed" : "8-K filed",
        detail: labels.length ? labels.join("; ") : undefined,
        upcoming: false,
        provenance: { source: "sec" as const, asOf: f.filingDate, url: filingDocUrl(cik, f), note: `${f.form} ${f.accessionNumber}` },
      };
    });
}

/** The two catalyst metrics: earnings within 30 days (1/0, null if no date) and the 8-K count. */
export function catalystMetrics(
  catalysts: readonly Catalyst[],
  today: string,
  quoteProv: Provenance | null,
  filingsProv: Provenance | null,
): { earningsWithin30d: ScanMetric; filings8k30d: ScanMetric } {
  const earnings = catalysts.find((c) => c.kind === "earnings");
  const days = earnings ? daysFrom(today, earnings.date) : null;
  const earningsWithin30d: ScanMetric = earnings && quoteProv
    ? {
        value: days !== null && days <= CATALYST_WINDOW_DAYS ? 1 : 0,
        unit: "flag",
        formula: `1 when the next earnings date is within ${CATALYST_WINDOW_DAYS} days of the screen date, else 0`,
        provenance: { ...quoteProv, note: `Next earnings ${earnings.date}${earnings.estimated ? " (estimated)" : ""}` },
      }
    : {
        value: null,
        unit: "flag",
        formula: `1 when the next earnings date is within ${CATALYST_WINDOW_DAYS} days of the screen date, else 0`,
        provenance: quoteProv ?? { source: "cnbc", asOf: "" },
        reason: quoteProv ? "CNBC lists no upcoming earnings date" : "No CNBC quote",
      };
  const count = catalysts.filter((c) => c.kind === "filing_8k").length;
  const filings8k30d: ScanMetric = filingsProv
    ? { value: count, unit: "count", formula: `Number of 8-K and 8-K/A filings in the last ${CATALYST_WINDOW_DAYS} days`, provenance: filingsProv }
    : { value: null, unit: "count", formula: `Number of 8-K and 8-K/A filings in the last ${CATALYST_WINDOW_DAYS} days`, provenance: { source: "sec", asOf: "" }, reason: "SEC filing list unavailable" };
  return { earningsWithin30d, filings8k30d };
}
