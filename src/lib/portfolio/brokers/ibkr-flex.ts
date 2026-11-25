/**
 * Parser for Interactive Brokers Flex Web Service XML (Activity Flex Query, format XML). Pure; no network.
 *
 * Flex XML is machine-written and regular: every record is one element whose fields are double-quoted
 * attributes, e.g. <OpenPosition accountId="U1" symbol="AAPL" position="10" ... />. Statements are grouped as
 * <FlexQueryResponse><FlexStatements><FlexStatement accountId=...>...</FlexStatement></FlexStatements>. Errors and
 * the SendRequest reply come as <FlexStatementResponse><Status/><ReferenceCode/><ErrorCode/><ErrorMessage/>.
 */

export type FlexStatus =
  | { ok: true; referenceCode: string | null }
  | { ok: false; code: number | null; message: string };

export type FlexPosition = {
  accountId: string;
  symbol: string;
  description: string;
  /** STK, FUND, CRYPTO, OPT, FUT, BOND, CASH, WAR, ... */
  assetCategory: string;
  /** e.g. "ETF", "COMMON", "ADR" (present when selected in the query). */
  subCategory: string;
  currency: string;
  listingExchange: string;
  conid: string;
  isin: string;
  /** Signed: negative for a short position. */
  quantity: number;
  markPrice: number | null;
  costBasisPrice: number | null;
  costBasisMoney: number | null;
  openPrice: number | null;
  /** YYYY-MM-DD from openDateTime (lot rows), when present. */
  openDate: string | null;
  /** YYYY-MM-DD the report is as of. */
  reportDate: string | null;
  level: "summary" | "lot";
};

export type FlexCash = { currency: string; endingCash: number };

export type FlexAccount = {
  accountId: string;
  alias: string;
  baseCurrency: string | null;
  /** YYYY-MM-DD the statement covers up to. */
  toDate: string | null;
  positions: FlexPosition[];
  cash: FlexCash[];
  /** False when the query has no Cash Report section (cash cannot be imported). */
  hasCashReport: boolean;
  hasOpenPositions: boolean;
};

export type FlexParse = { ok: true; accounts: FlexAccount[] } | { ok: false; error: string };

/**
 * Largest request body the IBKR route accepts (the JSON-encoded upload), under Vercel's 4.5 MB request limit so an
 * oversized file gets this app's message instead of a platform error. Checked in the browser before sending too.
 */
export const IBKR_MAX_REQUEST_BYTES = 4_000_000;

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function decode(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** Longest start tag or attribute value read; real Flex rows are well under this. */
const MAX_TAG_CHARS = 20_000;
const MAX_NUMBER_CHARS = 40;

const isNameChar = (c: string) => /[A-Za-z0-9_.:-]/.test(c);
const isSpace = (c: string) => c === " " || c === "\n" || c === "\r" || c === "\t";

/**
 * Attributes of one start tag's inner text. A single left-to-right pass (no backtracking regex), so crafted input
 * cannot make it slow.
 */
export function attributes(tagBody: string): Record<string, string> {
  const out: Record<string, string> = {};
  const s = tagBody.length > MAX_TAG_CHARS ? tagBody.slice(0, MAX_TAG_CHARS) : tagBody;
  let i = 0;
  while (i < s.length) {
    if (!isNameChar(s[i]) || /[0-9.:-]/.test(s[i])) {
      i++;
      continue;
    }
    const start = i;
    while (i < s.length && isNameChar(s[i])) i++;
    const name = s.slice(start, i);
    while (i < s.length && isSpace(s[i])) i++;
    if (s[i] !== "=") continue;
    i++;
    while (i < s.length && isSpace(s[i])) i++;
    const q = s[i];
    if (q !== '"' && q !== "'") continue;
    const end = s.indexOf(q, i + 1);
    if (end < 0) break;
    out[name] = decode(s.slice(i + 1, end));
    i = end + 1;
  }
  return out;
}

/** Index just after `<name` where the tag name ends exactly there (so "FlexStatement" never matches "FlexStatements"). */
function findTag(xml: string, name: string, from: number): number {
  const open = `<${name}`;
  for (let i = xml.indexOf(open, from); i >= 0; i = xml.indexOf(open, i + 1)) {
    const next = xml[i + open.length];
    if (next === undefined || next === ">" || next === "/" || isSpace(next)) return i;
  }
  return -1;
}

/**
 * Index of the '>' closing the start tag that begins at `from`, skipping '>' inside quoted attribute values; -1 when
 * the tag never closes. Linear: quoted values are jumped over with indexOf.
 */
function tagEnd(xml: string, from: number): number {
  for (let i = from; i < xml.length; i++) {
    const c = xml[i];
    if (c === ">") return i;
    if (c === '"' || c === "'") {
      const close = xml.indexOf(c, i + 1);
      if (close < 0) return -1;
      i = close;
    }
  }
  return -1;
}

/** Every <name .../> or <name ...> start tag in `xml`, as attribute maps. Linear: each step jumps past its tag. */
function elements(xml: string, name: string): Record<string, string>[] {
  const out: Record<string, string>[] = [];
  let i = findTag(xml, name, 0);
  while (i >= 0) {
    const close = tagEnd(xml, i + name.length + 1);
    if (close < 0) break;
    const body = xml.slice(i + name.length + 1, close);
    if (body.length <= MAX_TAG_CHARS) out.push(attributes(body.endsWith("/") ? body.slice(0, -1) : body));
    i = findTag(xml, name, close + 1);
  }
  return out;
}

function textOf(xml: string, name: string): string | null {
  const open = xml.indexOf(`<${name}>`);
  if (open < 0) return null;
  const from = open + name.length + 2;
  const close = xml.indexOf(`</${name}>`, from);
  if (close < 0 || close - from > MAX_TAG_CHARS) return null;
  return decode(xml.slice(from, close).trim());
}

/** A Flex number ("1234.5", "-3", "" or "--" for none). */
export function flexNumber(s: string | undefined): number | null {
  if (s === undefined || s.length > MAX_NUMBER_CHARS) return null;
  const t = s.trim().replace(/,/g, "");
  if (!t || !/^-?(?:\d+(?:\.\d*)?|\.\d+)(?:e-?\d+)?$/i.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const pad = (n: number) => String(n).padStart(2, "0");

function isoIfValid(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > 2200) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCMonth() === m - 1 ? `${y}-${pad(m)}-${pad(d)}` : null;
}

/**
 * A Flex date or date-time as YYYY-MM-DD. Accepts the formats Client Portal offers: yyyyMMdd, yyyy-MM-dd,
 * MM/dd/yyyy and dd/MM/yyyy (read as MM/dd unless the first part is above 12), each optionally followed by a time.
 */
export function flexDate(s: string | undefined): string | null {
  const t = s?.trim();
  if (!t) return null;
  let m = /^(\d{4})-?(\d{2})-?(\d{2})/.exec(t);
  if (m) return isoIfValid(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(t);
  if (m) {
    const a = +m[1];
    const b = +m[2];
    return a > 12 ? isoIfValid(+m[3], b, a) : isoIfValid(+m[3], a, b);
  }
  return null;
}

/** The SendRequest reply, or an error reply from either endpoint. */
export function parseFlexStatus(xml: string): FlexStatus | null {
  if (findTag(xml, "FlexStatementResponse", 0) < 0) return null;
  const status = textOf(xml, "Status");
  if (status === "Success") return { ok: true, referenceCode: textOf(xml, "ReferenceCode") };
  const code = Number(textOf(xml, "ErrorCode"));
  return { ok: false, code: Number.isFinite(code) && code > 0 ? code : null, message: textOf(xml, "ErrorMessage") ?? "IBKR returned an error." };
}

function position(a: Record<string, string>, fallbackAccount: string): FlexPosition | null {
  const quantity = flexNumber(a.position);
  const symbol = (a.symbol ?? "").trim();
  if (quantity === null || quantity === 0 || !symbol) return null;
  const level = /lot/i.test(a.levelOfDetail ?? "") ? "lot" : "summary";
  return {
    accountId: a.accountId || fallbackAccount,
    symbol,
    description: (a.description ?? "").trim(),
    assetCategory: (a.assetCategory ?? "").trim().toUpperCase(),
    subCategory: (a.subCategory ?? "").trim().toUpperCase(),
    currency: (a.currency ?? "").trim().toUpperCase(),
    listingExchange: (a.listingExchange ?? a.exchange ?? "").trim().toUpperCase(),
    conid: (a.conid ?? "").trim(),
    isin: (a.isin ?? "").trim().toUpperCase(),
    quantity,
    markPrice: flexNumber(a.markPrice),
    costBasisPrice: flexNumber(a.costBasisPrice),
    costBasisMoney: flexNumber(a.costBasisMoney),
    openPrice: flexNumber(a.openPrice),
    openDate: level === "lot" ? flexDate(a.openDateTime ?? a.holdingPeriodDateTime) : null,
    reportDate: flexDate(a.reportDate),
    level,
  };
}

function cashRows(xml: string): FlexCash[] {
  const seen = new Set<string>();
  const out: FlexCash[] = [];
  for (const a of elements(xml, "CashReportCurrency")) {
    const currency = (a.currency ?? "").trim().toUpperCase();
    // BASE_SUMMARY is the all-currency total in the base currency, not a balance of its own.
    if (!/^[A-Z]{3}$/.test(currency) || seen.has(currency)) continue;
    const endingCash = flexNumber(a.endingCash) ?? flexNumber(a.endingSettledCash);
    if (endingCash === null) continue;
    seen.add(currency);
    out.push({ currency, endingCash });
  }
  return out;
}

function account(statementTag: Record<string, string>, body: string): FlexAccount {
  const accountId = (statementTag.accountId ?? "").trim();
  const info = elements(body, "AccountInformation")[0] ?? {};
  const base = (info.currency ?? "").trim().toUpperCase();
  return {
    accountId,
    alias: (info.acctAlias ?? "").trim(),
    baseCurrency: /^[A-Z]{3}$/.test(base) ? base : null,
    toDate: flexDate(statementTag.toDate),
    positions: elements(body, "OpenPosition").flatMap((a) => position(a, accountId) ?? []),
    cash: cashRows(body),
    hasCashReport: findTag(body, "CashReport", 0) >= 0,
    hasOpenPositions: findTag(body, "OpenPositions", 0) >= 0,
  };
}

/** One entry per <FlexStatement>...</FlexStatement>, found with indexOf (linear). */
function statements(xml: string): { tag: Record<string, string>; body: string }[] {
  const out: { tag: Record<string, string>; body: string }[] = [];
  let i = findTag(xml, "FlexStatement", 0);
  while (i >= 0) {
    const startEnd = tagEnd(xml, i + "<FlexStatement".length);
    if (startEnd < 0) break;
    const end = xml.indexOf("</FlexStatement>", startEnd);
    if (end < 0) break;
    out.push({ tag: attributes(xml.slice(i + "<FlexStatement".length, startEnd)), body: xml.slice(startEnd + 1, end) });
    i = findTag(xml, "FlexStatement", end + 1);
  }
  return out;
}

/** A multi-day query can repeat an account (one statement per day): keep the latest statement of each. */
function latestPerAccount(accounts: FlexAccount[]): FlexAccount[] {
  const byId = new Map<string, FlexAccount>();
  for (const a of accounts) {
    const prev = byId.get(a.accountId);
    if (!prev || (a.toDate ?? "") >= (prev.toDate ?? "")) byId.set(a.accountId, a);
  }
  return [...byId.values()];
}

/** Parses a full Flex report. Fails with a plain reason when it is an error reply, CSV, or not a Flex report. */
export function parseFlexStatement(xml: string): FlexParse {
  const text = xml.replace(/^\uFEFF/, "").trim();
  const status = parseFlexStatus(text);
  if (status && !status.ok) return { ok: false, error: status.message };
  if (!text.startsWith("<")) return { ok: false, error: "This report is not XML. In IBKR, edit the Flex Query and set Format to XML." };
  if (findTag(text, "FlexQueryResponse", 0) < 0) return { ok: false, error: "This is not an IBKR Flex Query report." };
  const accounts = latestPerAccount(statements(text).map((st) => account(st.tag, st.body)));
  if (accounts.length === 0) return { ok: false, error: "The report has no account statements." };
  return { ok: true, accounts };
}
