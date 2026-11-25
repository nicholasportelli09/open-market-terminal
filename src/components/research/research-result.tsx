"use client";

import { AiKeyPrompt } from "@/components/shell/ai-key-prompt";
import { useEffect, useState } from "react";
import { displayTicker } from "@/lib/instruments";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { AnswerView } from "./answer-view";
import { MODE_OPTIONS } from "./research-form";
import type { ResearchState } from "./use-research";

const STEPS = [
  { after: 0, text: "Gathering quotes, SEC filings, FRED data and headlines" },
  { after: 8, text: "Reading the sourced data and headlines" },
  { after: 30, text: "Writing the answer and checking each figure against its source" },
];

function Progress({ startedAt, onCancel }: { startedAt: number; onCancel: () => void }) {
  const [now, setNow] = useState(startedAt);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const sec = Math.max(0, Math.floor((now - startedAt) / 1000));
  const step = [...STEPS].reverse().find((s) => sec >= s.after) ?? STEPS[0];
  return (
    <div className="space-y-4 py-2" role="status" aria-live="polite">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13.5px] font-medium">{step.text}</p>
        <span className="num shrink-0 text-[12px] text-faint">{sec}s</span>
      </div>
      <p className="text-[12px] text-faint">Research usually takes 30 to 90 seconds. Steps are the usual order of work, not live progress.</p>
      <div className="space-y-2.5">
        {[88, 72, 94, 60, 80].map((w, i) => <div key={i} className="skeleton h-4" style={{ width: `${w}%` }} />)}
      </div>
      <button type="button" onClick={onCancel} className="inline-flex h-8 cursor-pointer items-center rounded-lg border border-line px-3 text-[12.5px] font-medium text-muted hover:bg-hover hover:text-fg">
        Cancel
      </button>
    </div>
  );
}

type Props = { state: ResearchState; onCancel: () => void; onRetry: () => void; compact?: boolean };

export function ResearchResult({ state, onCancel, onRetry, compact = false }: Props) {
  if (state.status === "idle") {
    return (
      <EmptyState
        title="No research yet"
        body="Pick a mode, add tickers and run it. Answers cite their sources and label every line as a verified fact, an estimate or an interpretation."
      />
    );
  }
  if (state.status === "loading") return <Progress startedAt={state.startedAt} onCancel={onCancel} />;
  // No server AI key: a visitor can still use their own.
  if (state.status === "unavailable") return <AiKeyPrompt />;
  if (state.status === "error" && state.error.code === "unauthorized") return <AiKeyPrompt />;
  if (state.status === "error") return <ErrorState message={state.error.message} onRetry={onRetry} />;
  const e = state.entry;
  const mode = MODE_OPTIONS.find((m) => m.id === e.mode)?.label ?? e.mode;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted">
        <span className="font-semibold text-fg">{mode}</span>
        {e.symbols.length > 0 && <span className="num">{e.symbols.map(displayTicker).join(", ")}</span>}
        {e.window && <span>· window {e.window.toUpperCase()}</span>}
        {e.includedPortfolio && <span>· with your portfolio summary</span>}
        {!state.saved && <span className="text-down">· could not be saved to history on this device</span>}
      </div>
      {e.question && <p className="text-[12.5px] text-faint">&ldquo;{e.question}&rdquo;</p>}
      <AnswerView answer={e.answer} sources={e.sources} compact={compact} />
    </div>
  );
}
