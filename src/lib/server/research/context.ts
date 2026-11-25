/**
 * Server context builders: fetch our sourced data and turn it into ContextDoc drafts with provenance.
 * Failures become plain-language gaps (passed to the model and shown as warnings), never filler data.
 */
import type { ContextDoc } from "@/lib/server/ai/parse";
import { quoteProvenance } from "@/lib/market-session";
import { type Provenance, priceFeedOf, priceFeedUrl } from "@/lib/provenance";
import { displayTicker, hasShortName, shortName } from "@/lib/instruments";
import { fetchChart, fetchQuotes } from "@/lib/server/cnbc";
import { companySnapshot } from "@/lib/server/company";
import { fredMany, fredSeriesUrl } from "@/lib/server/fred";
import { marketNews, symbolNews } from "@/lib/server/news";
import type { Quote } from "@/lib/types";
import { MACRO_SERIES, headlinesContent, macroContent, quoteLine, snapshotContent, type FredLike } from "./docs";
import { WINDOW_LABEL, priceStats, priceStatsContent } from "./price-stats";
import type { MoveWindow } from "./types";

export type DocDraft = Omit<ContextDoc, "id">;
export type Gathered = { drafts: DocDraft[]; gaps: string[] };

const CHART_TTL_MS = 300_000;
const MACRO_LOOKBACK_DAYS = 430;

/** Numbers drafts S1..Sn in order. */
export function numberDocs(drafts: readonly DocDraft[]): ContextDoc[] {
  return drafts.map((d, i) => ({ id: `S${i + 1}`, ...d }));
}

export function merge(...parts: Gathered[]): Gathered {
  return { drafts: parts.flatMap((p) => p.drafts), gaps: parts.flatMap((p) => p.gaps) };
}

const reason = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** Same query shape the quote page uses for its News panel. */
export function newsQuery(symbol: string, name: string | undefined): string {
  if (hasShortName(symbol)) return `${shortName(symbol).replace(/\//g, " ")} price`;
  const clean = (name ?? "").replace(/\b(Inc|Corp|Corporation|Ltd|PLC|Co|Class [A-C]|Holdings?)\b\.?/gi, "").replace(/[^\p{L}\p{N} .&-]/gu, "").trim();
  return `${displayTicker(symbol)} ${clean} stock`.trim().slice(0, 80);
}

export type TickerOptions = { window?: MoveWindow; fundamentals?: boolean; headlines?: boolean; now?: Date };

/** Price (quote + daily stats), SEC fundamentals and recent headlines for one ticker. */
export async function tickerContext(symbol: string, opts: TickerOptions = {}): Promise<Gathered> {
  const now = opts.now ?? new Date();
  const window = opts.window ?? "3m";
  const [quoteR, chartR, snapR] = await Promise.allSettled([
    fetchQuotes([symbol]).then((qs) => qs.find((q) => q.symbol.toUpperCase() === symbol.toUpperCase()) ?? qs[0] ?? null),
    fetchChart(symbol, "1Y", CHART_TTL_MS),
    opts.fundamentals === false ? Promise.resolve(null) : companySnapshot(symbol),
  ]);
  const drafts: DocDraft[] = [];
  const gaps: string[] = [];
  const quote: Quote | null = quoteR.status === "fulfilled" ? quoteR.value : null;
  if (!quote) gaps.push(`No live quote for ${symbol}${quoteR.status === "rejected" ? ` (${reason(quoteR.reason)})` : ""}.`);

  const stats = chartR.status === "fulfilled" ? priceStats(chartR.value.bars, window) : null;
  if (!stats) gaps.push(`No daily price history for ${symbol}.`);
  if (quote || stats) {
    const prov: Provenance = quote
      ? quoteProvenance(quote, now)
      : { source: priceFeedOf(symbol), asOf: stats?.lastDate ?? "", session: "closed", note: "Daily closes" };
    const lines = [quote ? `Latest quote: ${quoteLine(quote, prov.session ?? "n/a", prov.asOf)}` : "", stats ? priceStatsContent(symbol, stats, window) : ""];
    drafts.push({
      title: `${symbol} price and performance (${WINDOW_LABEL[window].toLowerCase()} moves)`,
      provenance: { ...prov, url: priceFeedUrl(symbol) },
      content: lines.filter(Boolean).join("\n"),
    });
  }

  if (snapR.status === "fulfilled" && snapR.value) {
    const r = snapR.value;
    if (r.kind === "ok") {
      const s = r.snapshot;
      const revenue = s.metrics.revenueTTM.provenance;
      drafts.push({
        title: `${s.symbol} fundamentals from SEC filings`,
        provenance: {
          source: "sec",
          asOf: s.ttmPeriodEnd ?? s.balanceSheetDate ?? revenue.asOf,
          session: "n/a",
          url: revenue.url ?? `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${s.cik}`,
          note: "XBRL company facts; price-based ratios use the CNBC price",
        },
        content: snapshotContent(s),
      });
    } else {
      gaps.push(`Fundamentals unavailable for ${symbol}: ${r.message}`);
    }
  } else if (snapR.status === "rejected") {
    gaps.push(`SEC fundamentals for ${symbol} could not be loaded (${reason(snapR.reason)}).`);
  }

  if (opts.headlines !== false) {
    try {
      const items = await symbolNews(newsQuery(symbol, quote?.name));
      drafts.push({
        title: `${symbol} headlines, last 7 days`,
        provenance: { source: "google-news", asOf: items[0]?.published ?? now.toISOString(), session: "n/a", note: "Headline titles and links only" },
        content: headlinesContent(items),
      });
    } catch (err) {
      gaps.push(`Headlines for ${symbol} could not be loaded (${reason(err)}).`);
    }
  }
  return { drafts, gaps };
}

function isoDaysAgo(now: Date, days: number): string {
  return new Date(now.getTime() - days * 86_400_000).toISOString().slice(0, 10);
}

/** FRED macro snapshot: yields, curve, credit spread, VIX, CPI year over year. */
export async function macroContext(now = new Date()): Promise<Gathered> {
  try {
    const results = await fredMany(MACRO_SERIES.map((s) => s.id), { start: isoDaysAgo(now, MACRO_LOOKBACK_DAYS) });
    const byId: Record<string, FredLike> = Object.fromEntries(results.map((r) => [r.id, r.series]));
    const live = results.filter((r) => r.series);
    if (live.length === 0) return { drafts: [], gaps: ["FRED macro data could not be loaded."] };
    const latest = live.map((r) => r.series!.last.date).sort().at(-1) ?? "";
    return {
      drafts: [{
        title: "US macro snapshot (FRED)",
        provenance: { source: "fred", asOf: latest, session: "n/a", url: fredSeriesUrl("DGS10"), note: `Series ${MACRO_SERIES.map((s) => s.id).join(", ")}; each line has its own date` },
        content: macroContent(byId),
      }],
      gaps: results.filter((r) => !r.series).map((r) => `FRED series ${r.id} unavailable.`),
    };
  } catch (err) {
    return { drafts: [], gaps: [`FRED macro data could not be loaded (${reason(err)}).`] };
  }
}

/** Top business headlines (CNBC RSS). */
export async function marketHeadlinesContext(limit = 12): Promise<Gathered> {
  try {
    const items = await marketNews();
    return {
      drafts: [{
        title: "Top business headlines (CNBC)",
        provenance: { source: "cnbc", asOf: items[0]?.published ?? new Date().toISOString(), session: "n/a", url: "https://www.cnbc.com/business/", note: "Headline titles and links only" },
        content: headlinesContent(items, limit),
      }],
      gaps: [],
    };
  } catch (err) {
    return { drafts: [], gaps: [`Market headlines could not be loaded (${reason(err)}).`] };
  }
}
