import type { EarningsItem, EconEvent, Statement, StatementRow } from "@/lib/types";
import { cached } from "./cache";

/** Nasdaq's public site API (keyless, unofficial). Used for calendars and financial statements only. */
const BASE = "https://api.nasdaq.com/api";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36";
const TIMEOUT_MS = 8_000;
const CALENDAR_TTL_MS = 5 * 60_000;
const FUNDAMENTALS_TTL_MS = 6 * 3_600_000;

type Raw = Record<string, unknown>;

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "";
}

function numOrNull(v: unknown): number | null {
  const n = Number(str(v).replace(/[$,%\s]/g, ""));
  return str(v) && Number.isFinite(n) ? n : null;
}

async function nasdaq(path: string, ttlMs: number): Promise<Raw | null> {
  return cached(`n:${path}`, ttlMs, async () => {
    const res = await fetch(`${BASE}${path}`, {
      headers: { "User-Agent": UA, Accept: "application/json", "Accept-Language": "en-US,en;q=0.9" },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`Nasdaq ${res.status}`);
    const body = (await res.json()) as Raw;
    return (body.data as Raw | null) ?? null;
  });
}

function rows(data: Raw | null): Raw[] {
  const list = data?.rows;
  return Array.isArray(list) ? (list as Raw[]) : [];
}

export async function economicCalendar(date: string): Promise<EconEvent[]> {
  const data = await nasdaq(`/calendar/economicevents?date=${date}`, CALENDAR_TTL_MS);
  return rows(data).map((r) => ({
    time: str(r.gmt),
    country: str(r.country),
    event: str(r.eventName).replace(/&amp;/g, "&"),
    actual: str(r.actual).replace(/&nbsp;/g, ""),
    consensus: str(r.consensus).replace(/&nbsp;/g, ""),
    previous: str(r.previous).replace(/&nbsp;/g, ""),
  }));
}

export async function earningsCalendar(date: string): Promise<EarningsItem[]> {
  const data = await nasdaq(`/calendar/earnings?date=${date}`, CALENDAR_TTL_MS);
  return rows(data)
    .map((r) => {
      const time = str(r.time);
      return {
        symbol: str(r.symbol),
        name: str(r.name),
        when: (time.includes("pre") ? "pre" : time.includes("after") ? "post" : "") as EarningsItem["when"],
        eps: str(r.eps),
        epsForecast: str(r.epsForecast),
        surprisePct: numOrNull(r.surprise),
        marketCap: numOrNull(r.marketCap),
      };
    })
    .filter((r) => r.symbol)
    .sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0));
}

const STATEMENTS: { id: Statement["id"]; key: string; label: string }[] = [
  { id: "income", key: "incomeStatementTable", label: "Income" },
  { id: "balance", key: "balanceSheetTable", label: "Balance sheet" },
  { id: "cashflow", key: "cashFlowTable", label: "Cash flow" },
  { id: "ratios", key: "financialRatiosTable", label: "Ratios" },
];

function toStatement(table: Raw | undefined, id: Statement["id"], label: string): Statement | null {
  const headers = (table?.headers ?? {}) as Raw;
  const cols = Object.keys(headers).filter((k) => k !== "value1").sort((a, b) => Number(a.slice(5)) - Number(b.slice(5)));
  const periods = cols.map((k) => str(headers[k]));
  const parsed: StatementRow[] = rows(table ?? null).map((r) => {
    const values = cols.map((k) => str(r[k]));
    return { label: str(r.value1), values, section: values.every((v) => !v) };
  });
  // Drop a section heading that has no rows under it.
  const out = parsed.filter((r, i) => !r.section || (parsed[i + 1] && !parsed[i + 1].section));
  return periods.length && out.some((r) => !r.section) ? { id, label, periods, rows: out } : null;
}

export async function financialStatements(symbol: string, quarterly: boolean): Promise<Statement[]> {
  const data = await nasdaq(`/company/${encodeURIComponent(symbol)}/financials?frequency=${quarterly ? 2 : 1}`, FUNDAMENTALS_TTL_MS);
  if (!data) return [];
  return STATEMENTS.map((s) => toStatement(data[s.key] as Raw | undefined, s.id, s.label)).filter((s): s is Statement => !!s);
}
