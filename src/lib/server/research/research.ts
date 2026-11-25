/** Runs one research request: gathers sourced context for the mode, then the analyst with web search. */
import type { AnalystAnswer } from "@/lib/ai/types";
import { runAnalyst } from "@/lib/server/ai/analyst";
import type { Provenance } from "@/lib/provenance";
import { macroContext, marketHeadlinesContext, merge, numberDocs, tickerContext, type Gathered } from "./context";
import { portfolioDraft } from "./portfolio-summary";
import { MODE_LIMITS, MODE_TASK, gapsNote, researchQuestion } from "./prompts";
import type { ResearchRequest } from "./types";

const WEB_SEARCHES = 2;
const PORTFOLIO_PRICE_DOCS = 5;

async function gather(req: ResearchRequest): Promise<Gathered> {
  const now = new Date();
  const tickers = (symbols: string[], opts: Parameters<typeof tickerContext>[1] = {}) =>
    Promise.all(symbols.map((s) => tickerContext(s, { now, ...opts })));
  const portfolio: Gathered = req.portfolio ? { drafts: [portfolioDraft(req.portfolio)], gaps: [] } : { drafts: [], gaps: [] };

  switch (req.mode) {
    case "analyze":
    case "challenge":
      return merge(portfolio, ...(await tickers(req.symbols)), await macroContext(now));
    case "explain_move":
      return merge(portfolio, ...(await tickers(req.symbols, { window: req.window ?? "1d" })), await marketHeadlinesContext(8));
    case "compare":
      // Headlines matter less side by side; keep the context compact for four tickers.
      return merge(portfolio, ...(await tickers(req.symbols, { headlines: req.symbols.length <= 2 })), await macroContext(now));
    case "portfolio": {
      const top = [...(req.portfolio?.positions ?? [])]
        .sort((a, b) => (b.weightPct ?? 0) - (a.weightPct ?? 0))
        .slice(0, PORTFOLIO_PRICE_DOCS)
        .map((p) => p.symbol);
      return merge(portfolio, ...(await tickers(top, { fundamentals: false, headlines: false })), await macroContext(now));
    }
    case "opportunities":
      return merge(portfolio, ...(await tickers(req.symbols, { headlines: false })), await macroContext(now), await marketHeadlinesContext(10));
  }
}

export type ResearchResult = { answer: AnalystAnswer; sources: Provenance[] };

/** Throws AiError (from runAnalyst) on AI failures; data gaps become warnings, not errors. */
export async function runResearch(req: ResearchRequest, signal?: AbortSignal): Promise<ResearchResult> {
  const { drafts, gaps } = await gather(req);
  const context = numberDocs(drafts);
  const answer = await runAnalyst({
    task: MODE_TASK[req.mode],
    question: researchQuestion(req) + gapsNote(gaps),
    context,
    webSearch: { enabled: true, maxUses: WEB_SEARCHES },
    effort: "low",
    limits: MODE_LIMITS[req.mode],
    signal,
  });
  const sources = context.flatMap((d) => (d.provenance ? [d.provenance] : []));
  return { answer: { ...answer, warnings: [...gaps.map((g) => `Data gap: ${g}`), ...answer.warnings] }, sources };
}
