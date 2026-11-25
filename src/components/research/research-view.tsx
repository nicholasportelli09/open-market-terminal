"use client";

import { useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { Panel } from "@/components/ui/panel";
import { HistoryList } from "./history-list";
import { AI_FOOTER } from "./answer-view";
import { ResearchForm, isResearchMode } from "./research-form";
import { ResearchResult } from "./research-result";
import { useResearch } from "./use-research";

const SYMBOL_RE = /^[A-Za-z0-9.@=\-^_]{1,24}$/;

/** Deep link: /research?symbol=AAPL&mode=analyze (symbol may be a comma list for compare). */
function useDeepLink() {
  const params = useSearchParams();
  const rawMode = params.get("mode");
  const rawSymbol = params.get("symbol") ?? "";
  return useMemo(() => {
    const symbols = rawSymbol.split(",").map((s) => s.trim().toUpperCase()).filter((s) => SYMBOL_RE.test(s)).slice(0, 4);
    const mode = isResearchMode(rawMode) ? rawMode : symbols.length > 1 ? "compare" : "analyze";
    return { mode, symbols };
  }, [rawMode, rawSymbol]);
}

export function ResearchView() {
  const link = useDeepLink();
  const { state, run, cancel, show } = useResearch();
  const busy = state.status === "loading";
  const lastRequest = state.status === "error" || state.status === "unavailable" || state.status === "loading" ? state.request : null;
  const activeId = state.status === "ok" ? state.entry.id : undefined;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight sm:text-[26px]">Research analyst</h1>
        <p className="mt-1 max-w-[70ch] text-[13.5px] text-muted">
          Ask about a company, a move, a comparison, your thesis or your portfolio. Answers are built from SEC filings, CNBC prices, FRED data and headlines (plus web search when the server&apos;s AI provider offers it). {AI_FOOTER}
        </p>
      </div>
      <div className="grid gap-5 lg:grid-cols-[380px_minmax(0,1fr)]">
        <div className="min-w-0 space-y-5">
          <Panel title="Ask" bodyClassName="p-4">
            <ResearchForm initialMode={link.mode} initialSymbols={link.symbols} busy={busy} onSubmit={run} />
          </Panel>
          <Panel title="History" className="hidden lg:block">
            <HistoryList activeId={activeId} onOpen={show} />
          </Panel>
        </div>
        <div className="min-w-0 space-y-5">
          <Panel title="Answer" bodyClassName="p-4 sm:p-5">
            <ResearchResult state={state} onCancel={cancel} onRetry={() => lastRequest && run(lastRequest)} />
          </Panel>
          <Panel title="History" className="lg:hidden">
            <HistoryList activeId={activeId} onOpen={show} />
          </Panel>
        </div>
      </div>
    </div>
  );
}
