/**
 * Symbol search across exchanges. Merges, best first:
 * 1. exact ticker or exchange-code hits ("AAPL", "9984" -> 9984.T-JP, "000660" -> 000660-KR);
 * 2. home listings of large Asian companies whose name or alias starts with the query (asia-listings.ts),
 *    which CNBC's 11-result lookup often leaves out ("softbank" -> 9984.T-JP);
 * 3. Korean listings from Naver, when the query is Korean script or a code;
 * 4. CNBC's home listings, then weaker matches (a later word of an Asian name, a few Naver rows for Latin
 *    queries), then secondary copies (Frankfurt, London "0xxx", US OTC, Brazilian receipts).
 * A merge where any source failed is cached only briefly, so one upstream blip does not hide listings.
 */
import { type AsiaListing, matchAsiaListings } from "@/lib/asia-listings";
import type { SearchResult } from "@/lib/types";
import { fetchQuotes, searchCnbc } from "./cnbc";
import { searchKr } from "./naver";

const MAX_RESULTS = 12;
const SEARCH_TTL_MS = 300_000;
const PARTIAL_TTL_MS = 10_000;
const MAX_CACHED = 500;
/** Naver rows shown for a Latin-script query (its matches there are mostly Korean-named ETFs). */
const LATIN_KOREA_ROWS = 3;
/** Strong Asian name matches placed ahead of CNBC's own listings; the rest follow them. */
const MAX_STRONG_AHEAD = 3;
/** A name-prefix match ranks ahead only from this length, so common words ("bank", "delta") keep CNBC's order. */
const STRONG_PREFIX_MIN = 6;

const SUFFIX_EXCHANGE: Record<string, string> = {
  KR: "Korea Exchange",
  JP: "Tokyo Stock Exchange",
  HK: "Hong Kong Stock Exchange",
  TW: "Taiwan Stock Exchange",
};

function listingExchange(symbol: string): string {
  const suffix = symbol.slice(symbol.lastIndexOf("-") + 1);
  if (suffix === "CN") return symbol.startsWith("6") ? "Shanghai Stock Exchange" : "Shenzhen Stock Exchange";
  return SUFFIX_EXCHANGE[suffix] ?? "";
}

const fromListing = (l: AsiaListing): SearchResult => ({ symbol: l.symbol, name: l.name, type: "STOCK", exchange: listingExchange(l.symbol) });

/** A copy of a listing traded away from its home market. Exported for tests. */
export function isSecondaryListing(r: SearchResult): boolean {
  if (/Frankfurt|OTC|Over The Counter/i.test(r.exchange)) return true;
  if (/^0[A-Z0-9]{3}-GB$/.test(r.symbol)) return true; // London international order book codes
  return r.symbol.includes("'"); // Brazilian depositary receipts such as SKHY3'-BR
}

/** Symbols an all-digit query could be on Asian exchanges. Exported for tests. */
export function codeCandidates(query: string): string[] {
  const q = query.trim();
  if (!/^\d{1,6}$/.test(q)) return [];
  const out: string[] = [];
  if (q.length === 6) out.push(`${q}-KR`, `${q}-CN`);
  if (q.length === 4) out.push(`${q}.T-JP`, `${q}-TW`);
  if (q.length <= 5 && Number(q) > 0) out.push(`${Number(q)}-HK`);
  return out;
}

async function codeHits(query: string): Promise<SearchResult[]> {
  const candidates = codeCandidates(query);
  if (candidates.length === 0) return [];
  const quotes = await fetchQuotes(candidates);
  return candidates.flatMap((sym) => {
    const q = quotes.find((x) => x.symbol === sym);
    return q && q.last !== null ? [{ symbol: sym, name: q.name, type: q.type || "STOCK", exchange: q.exchange || listingExchange(sym) }] : [];
  });
}

export type SearchGroups = {
  code: SearchResult[];
  curated: { result: SearchResult; score: number }[];
  korea: SearchResult[];
  cnbc: SearchResult[];
};

/** Korean script or an all-digit code: the user is looking for a Korean (or Asian) listing. */
const asianQuery = (q: string) => /[\p{Script=Hangul}]/u.test(q) || /^\d+$/.test(q.trim());

/** Merge ranked groups, keeping the first occurrence of each symbol. Exported for tests. */
export function mergeResults(query: string, groups: SearchGroups): SearchResult[] {
  const q = query.trim().toUpperCase();
  const exactTicker = groups.cnbc.filter((r) => r.symbol.toUpperCase() === q);
  const home = groups.cnbc.filter((r) => !isSecondaryListing(r));
  const secondary = groups.cnbc.filter(isSecondaryListing);
  const isStrong = (score: number) => score === 3 || (score === 2 && query.trim().length >= STRONG_PREFIX_MIN);
  const strongAll = groups.curated.filter((c) => isStrong(c.score)).map((c) => c.result);
  const strong = strongAll.slice(0, MAX_STRONG_AHEAD);
  const weak = [...strongAll.slice(MAX_STRONG_AHEAD), ...groups.curated.filter((c) => !isStrong(c.score)).map((c) => c.result)];
  const koreaFirst = asianQuery(query) ? groups.korea : [];
  const koreaLater = asianQuery(query) ? [] : groups.korea.slice(0, LATIN_KOREA_ROWS);
  const seen = new Set<string>();
  const out: SearchResult[] = [];
  for (const r of [...exactTicker, ...groups.code, ...strong, ...koreaFirst, ...home, ...weak, ...koreaLater, ...secondary]) {
    if (seen.has(r.symbol)) continue;
    seen.add(r.symbol);
    out.push(r);
  }
  return out.slice(0, MAX_RESULTS);
}

/** Exchange prefixes as Google Finance and others write them ("KRX: 000660"), mapped to our symbol for a code. */
const PREFIX_SYMBOL: Record<string, (code: string) => string> = {
  KRX: (c) => `${c}-KR`,
  KOSPI: (c) => `${c}-KR`,
  KOSDAQ: (c) => `${c}-KR`,
  TYO: (c) => `${c}.T-JP`,
  TSE: (c) => `${c}.T-JP`,
  JPX: (c) => `${c}.T-JP`,
  HKG: (c) => `${Number(c)}-HK`,
  HKEX: (c) => `${Number(c)}-HK`,
  SEHK: (c) => `${Number(c)}-HK`,
  SHA: (c) => `${c}-CN`,
  SSE: (c) => `${c}-CN`,
  SHE: (c) => `${c}-CN`,
  SZSE: (c) => `${c}-CN`,
  TPE: (c) => `${c}-TW`,
  TWSE: (c) => `${c}-TW`,
};
/** Prefixes that only name the venue; the code after them is searched as typed. */
const PLAIN_PREFIXES = new Set(["NASDAQ", "NYSE", "NYSEARCA", "AMEX", "BATS", "OTC", "OTCMKTS", "LON", "LSE", "ETR", "XETRA", "EPA", "AMS", "SWX", "TSX", "ASX"]);

/** "KRX: 000660" -> code "000660", symbol "000660-KR"; "NASDAQ:AAPL" -> code "AAPL". Exported for tests. */
export function splitExchangePrefix(query: string): { code: string; symbol: string | null } | null {
  const m = /^([A-Za-z]{2,8})\s*:\s*([A-Za-z0-9.\-]{1,12})$/.exec(query.trim());
  if (!m) return null;
  const prefix = m[1].toUpperCase();
  const code = m[2].toUpperCase();
  const toSymbol = PREFIX_SYMBOL[prefix];
  if (toSymbol) return { code, symbol: /^\d+$/.test(code) ? toSymbol(code) : null };
  return PLAIN_PREFIXES.has(prefix) ? { code, symbol: null } : null;
}

const recent = new Map<string, { at: number; ttl: number; results: SearchResult[] }>();

export async function searchSymbols(query: string): Promise<SearchResult[]> {
  const prefixed = splitExchangePrefix(query);
  if (prefixed) {
    const results = await searchSymbols(prefixed.code);
    const want = prefixed.symbol;
    return want ? [...results.filter((r) => r.symbol === want), ...results.filter((r) => r.symbol !== want)] : results;
  }
  const key = query.toLowerCase();
  const hit = recent.get(key);
  if (hit && Date.now() - hit.at < hit.ttl) return hit.results;

  let failed = false;
  const fail = <T>(fallback: T) => () => {
    failed = true;
    return fallback;
  };
  const [cnbc, korea, code] = await Promise.all([
    searchCnbc(query).catch(fail(null)),
    searchKr(query).catch(fail([] as SearchResult[])),
    codeHits(query).catch(fail([] as SearchResult[])),
  ]);
  const curated = matchAsiaListings(query).map((m) => ({ result: fromListing(m.listing), score: m.score }));
  // Only report a failure when nothing else answered.
  if (cnbc === null && korea.length === 0 && code.length === 0 && curated.length === 0) throw new Error("Search unavailable");
  const results = mergeResults(query, { code, curated, korea, cnbc: cnbc ?? [] });
  if (recent.size > MAX_CACHED) recent.clear();
  recent.set(key, { at: Date.now(), ttl: failed ? PARTIAL_TTL_MS : SEARCH_TTL_MS, results });
  return results;
}
