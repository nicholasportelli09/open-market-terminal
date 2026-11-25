/**
 * Daily market briefing: about 100 words on the market day, catalysts, macro and portfolio exposures,
 * from CNBC quotes, headlines, the (unofficial) Nasdaq economic calendar and web search.
 * Cached in memory for 3 hours per (market date, portfolio hash).
 */
import { payerScope } from "@/lib/server/ai/credentials";
import type { AnalystAnswer } from "@/lib/ai/types";
import { runAnalyst } from "@/lib/server/ai/analyst";
import { quoteProvenance } from "@/lib/market-session";
import type { Provenance } from "@/lib/provenance";
import { fetchQuotes } from "@/lib/server/cnbc";
import { economicCalendar } from "@/lib/server/nasdaq";
import { marketHeadlinesContext, merge, numberDocs, type DocDraft, type Gathered } from "./context";
import { calendarContent, quoteLine } from "./docs";
import {
  BRIEFING_MAX_WORDS,
  BRIEFING_SYMBOLS,
  BRIEFING_TARGET_WORDS,
  BRIEFING_TTL_MS,
  answerWordCount,
  briefingCacheKey,
  briefingSession,
} from "./briefing-core";
import { portfolioDraft, portfolioHash } from "./portfolio-summary";
import { gapsNote } from "./prompts";
import type { Briefing, PortfolioSummary } from "./types";

const WEB_SEARCHES = 1;
const MAX_ENTRIES = 50;
/**
 * The one search goes to primary sources and major financial news only (no aggregator blogs). Reuters, AP, WSJ,
 * FT and MarketWatch block Anthropic's crawler and make the API reject the whole request, so they are not listed.
 */
const BRIEFING_DOMAINS = [
  "cnbc.com", "bloomberg.com", "finance.yahoo.com", "nasdaq.com",
  "federalreserve.gov", "bls.gov", "bea.gov", "treasury.gov", "sec.gov", "census.gov",
];

const TASK =
  "Write the daily market briefing for a non-expert owner of a market terminal. Prefer primary sources when you search: central banks, BLS, BEA, Treasury, SEC filings, company investor relations, and major wires (Reuters, AP, Bloomberg).";

type Entry = { at: number; value: { briefing: Omit<Briefing, "fromCache">; sources: Provenance[] } };
const store = new Map<string, Entry>();
const inflight = new Map<string, Promise<Entry["value"]>>();

async function quotesContext(now: Date): Promise<Gathered> {
  try {
    const quotes = await fetchQuotes([...BRIEFING_SYMBOLS]);
    const drafts: DocDraft[] = quotes.map((q) => {
      const prov = quoteProvenance(q, now);
      return { title: `${q.name} (${q.symbol}) quote`, provenance: prov, content: quoteLine(q, prov.session ?? "n/a", prov.asOf) };
    });
    const missing = BRIEFING_SYMBOLS.filter((s) => !quotes.some((q) => q.symbol === s));
    return { drafts, gaps: missing.map((s) => `No quote for ${s}.`) };
  } catch (err) {
    return { drafts: [], gaps: [`Market quotes could not be loaded (${err instanceof Error ? err.message : String(err)}).`] };
  }
}

/** YYYY-MM-DD plus one calendar day. */
function nextDay(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

async function calendarContext(date: string): Promise<Gathered> {
  try {
    // Nasdaq's economicevents?date=D lists the releases of the day before D (checked: date=2026-11-20 returns
    // Thursday 2026-11-19 jobless claims and Philly Fed), so ask for the next day to get `date`'s events.
    const events = await economicCalendar(nextDay(date));
    return {
      drafts: [{
        title: `Economic calendar for ${date} (Nasdaq.com, unofficial)`,
        provenance: { source: "nasdaq", asOf: date, session: "n/a", url: "https://www.nasdaq.com/market-activity/economic-calendar", note: "Unofficial source; confirm releases at the agency" },
        content: calendarContent(events.filter((e) => e.country === "United States").concat(events.filter((e) => e.country !== "United States")), 15),
      }],
      gaps: [],
    };
  } catch (err) {
    return { drafts: [], gaps: [`Economic calendar could not be loaded (${err instanceof Error ? err.message : String(err)}).`] };
  }
}

function question(sessionNote: string, marketDate: string, hasPortfolio: boolean): string {
  const lines = [
    `Write today's market briefing covering the market day ${marketDate}. ${sessionNote}`,
    `Hard limit: about ${BRIEFING_TARGET_WORDS} words in total, never more than ${BRIEFING_MAX_WORDS}. Use two or three short sections: The market day, Catalysts and macro${hasPortfolio ? ", Your portfolio" : ""}. Write at most 6 statements in total, each under 18 words; combine related moves into one statement and leave out minor details.`,
    "Cover how the major indices, yields, the dollar, oil, gold and bitcoin moved (from the supplied quotes), the main catalysts, and macro developments or scheduled releases.",
    hasPortfolio ? "Mention only the portfolio exposures most affected by today's moves, by symbol and weight." : "",
    "Search the web for what drove the session, and link primary sources where possible.",
  ];
  return lines.filter(Boolean).join("\n");
}

async function generate(portfolio: PortfolioSummary | undefined, now: Date): Promise<Entry["value"]> {
  const { marketDate, sessionNote } = briefingSession(now);
  const gathered = merge(
    portfolio ? { drafts: [portfolioDraft(portfolio)], gaps: [] } : { drafts: [], gaps: [] },
    ...(await Promise.all([quotesContext(now), marketHeadlinesContext(12), calendarContext(marketDate)])),
  );
  const context = numberDocs(gathered.drafts);
  // One call only (no "shorter please" retry): an over-long draft is flagged rather than paid for twice.
  let answer: AnalystAnswer = await runAnalyst({
    task: TASK,
    question: question(sessionNote, marketDate, !!portfolio) + gapsNote(gathered.gaps),
    context,
    webSearch: { enabled: true, maxUses: WEB_SEARCHES, allowedDomains: BRIEFING_DOMAINS },
    effort: "low",
    limits: { maxLines: 6, perSection: 3, maxSections: 3 },
    maxTokens: 4_000,
  });
  const words = answerWordCount(answer);
  if (words > BRIEFING_MAX_WORDS) {
    answer = { ...answer, warnings: [`This briefing is ${words} words, longer than the ${BRIEFING_TARGET_WORDS}-word target.`, ...answer.warnings] };
  }
  const generatedAt = new Date().toISOString();
  return {
    briefing: { answer, wordCount: words, marketDate, sessionNote, generatedAt },
    sources: context.flatMap((d) => (d.provenance ? [d.provenance] : [])),
  };
}

export type BriefingResult = { briefing: Briefing; sources: Provenance[] };

/**
 * Cache key for a request at `now` (used by the route to decide whether the rate guard applies). Split by who pays,
 * so a briefing made with the server's keys is never handed to a request that came with a visitor key.
 */
export function briefingKey(portfolio: PortfolioSummary | undefined, now = new Date()): string {
  return `${payerScope()}|${briefingCacheKey(briefingSession(now).marketDate, portfolioHash(portfolio))}`;
}

export function cachedBriefing(key: string, now = Date.now()): BriefingResult | null {
  const hit = store.get(key);
  if (!hit || now - hit.at >= BRIEFING_TTL_MS) return null;
  return { briefing: { ...hit.value.briefing, fromCache: true }, sources: hit.value.sources };
}

/** Generates (coalescing concurrent requests for the same key) and caches. Throws AiError on AI failures. */
export async function generateBriefing(key: string, portfolio: PortfolioSummary | undefined): Promise<BriefingResult> {
  let pending = inflight.get(key);
  if (!pending) {
    pending = generate(portfolio, new Date())
      .then((value) => {
        if (store.size >= MAX_ENTRIES) store.clear();
        store.set(key, { at: Date.now(), value });
        return value;
      })
      .finally(() => inflight.delete(key));
    inflight.set(key, pending);
  }
  const value = await pending;
  return { briefing: { ...value.briefing, fromCache: false }, sources: value.sources };
}
