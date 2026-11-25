"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { Segmented } from "@/components/ui/panel";
import {
  MAX_QUESTION_CHARS,
  MAX_THESIS_CHARS,
  MIN_THESIS_CHARS,
  MODE_SYMBOLS,
  MOVE_WINDOWS,
  type MoveWindow,
  type PortfolioSummary,
  type ResearchMode,
  type ResearchRequest,
} from "@/lib/server/research/types";
import { ModePicker } from "./mode-picker";
import { PortfolioToggle } from "./portfolio-toggle";
import { TickerChips, exactMatch, searchTickers } from "./ticker-chips";

export const MODE_OPTIONS: readonly { id: ResearchMode; label: string; hint: string }[] = [
  { id: "analyze", label: "Analyze", hint: "One security: business, results, valuation, price action, news and risks." },
  { id: "explain_move", label: "Explain move", hint: "Why one security moved over a window, from dated price moves and headlines." },
  { id: "compare", label: "Compare", hint: "Two to four securities side by side on the same metrics." },
  { id: "challenge", label: "Challenge", hint: "Paste your thesis; get the strongest counter-evidence and what would disconfirm it." },
  { id: "portfolio", label: "Portfolio", hint: "Review your saved portfolio: concentration, exposures and risks." },
  { id: "opportunities", label: "Ideas", hint: "Research ideas within a theme you describe, each with cited evidence." },
];

const WINDOW_LABEL: Record<MoveWindow, string> = { "1d": "1D", "1w": "1W", "1m": "1M", "3m": "3M", ytd: "YTD", "1y": "1Y" };
const WINDOW_OPTIONS = MOVE_WINDOWS.map((w) => ({ id: w, label: WINDOW_LABEL[w] }));

export function isResearchMode(v: string | null): v is ResearchMode {
  return !!v && MODE_OPTIONS.some((m) => m.id === v);
}

/** Client-side check mirroring the server validator; returns a message or null. */
export function formProblem(r: ResearchRequest, portfolioOn: boolean): string | null {
  const [min, max] = MODE_SYMBOLS[r.mode];
  if (r.symbols.length < min) return min === 1 ? "Add a ticker first." : `Add at least ${min} tickers.`;
  if (r.symbols.length > max) return max === 0 ? "This mode does not use tickers; remove them." : `Use at most ${max} tickers.`;
  if (r.mode === "challenge" && (r.thesis ?? "").trim().length < MIN_THESIS_CHARS) return `Paste a thesis of at least ${MIN_THESIS_CHARS} characters.`;
  if (r.mode === "opportunities" && r.question.trim().length < 3) return "Describe the theme you want ideas for.";
  if (r.mode === "portfolio" && !r.portfolio) return portfolioOn ? "Your portfolio summary is not ready yet." : "Turn on \"Include my saved portfolio\" to review it.";
  return null;
}

type Props = {
  initialMode?: ResearchMode;
  initialSymbols?: string[];
  busy: boolean;
  onSubmit: (r: ResearchRequest) => void;
  compact?: boolean;
  /** False while hidden (closed drawer): the portfolio preview, which polls prices, is unmounted. */
  active?: boolean;
};

const field = "w-full rounded-xl border border-line bg-card px-3 py-2 text-[13.5px] outline-none placeholder:text-faint focus:border-line-strong";

export function ResearchForm({ initialMode = "analyze", initialSymbols = [], busy, onSubmit, compact = false, active = true }: Props) {
  const ids = useId();
  const [mode, setMode] = useState<ResearchMode>(initialMode);
  const [symbols, setSymbols] = useState<string[]>(initialSymbols);
  const [question, setQuestion] = useState("");
  const [thesis, setThesis] = useState("");
  const [moveWindow, setMoveWindow] = useState<MoveWindow>("1m");
  const [portfolioOn, setPortfolioOn] = useState(false);
  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const onSummary = useCallback((s: PortfolioSummary | null) => setSummary(s), []);

  useEffect(() => setMode(initialMode), [initialMode]);
  const initialKey = initialSymbols.join(",");
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!initialKey) return;
    const list = initialKey.split(",");
    setSymbols(list);
    // Prefilled tickers (deep link, quote page) get the same search check as typed ones.
    const c = new AbortController();
    Promise.all(list.map((s) => searchTickers(s, c.signal).then((r) => (exactMatch(r, s) ? null : s))))
      .then((bad) => {
        const unknown = bad.filter((s): s is string => !!s);
        if (unknown.length === 0) return;
        setSymbols((cur) => cur.filter((s) => !unknown.includes(s)));
        setNotice(`Removed ${unknown.join(", ")}: no matching instrument found.`);
      })
      .catch(() => undefined); // search unavailable: keep the prefill; the server validates the format
    return () => c.abort();
  }, [initialKey]);
  useEffect(() => setProblem(null), [mode, symbols, question, thesis, portfolioOn, summary]);

  const [, maxSymbols] = MODE_SYMBOLS[mode];
  useEffect(() => {
    if (maxSymbols > 0) setSymbols((cur) => (cur.length > maxSymbols ? cur.slice(0, maxSymbols) : cur));
  }, [maxSymbols]);
  const hint = MODE_OPTIONS.find((m) => m.id === mode)?.hint;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const req: ResearchRequest = {
      mode,
      symbols: maxSymbols === 0 ? [] : symbols.slice(0, maxSymbols),
      question: question.trim(),
      ...(mode === "challenge" ? { thesis: thesis.trim() } : {}),
      ...(mode === "explain_move" ? { window: moveWindow } : {}),
      ...(portfolioOn && summary ? { portfolio: summary } : {}),
    };
    const p = formProblem(req, portfolioOn);
    setProblem(p);
    if (!p) onSubmit(req);
  };

  const questionLabel = mode === "opportunities" ? "Theme" : "Question (optional)";
  const questionPlaceholder =
    mode === "opportunities" ? "e.g. companies supplying power equipment to data centers" : mode === "explain_move" ? "Anything specific? e.g. was it the earnings report?" : "Anything specific you want covered?";

  return (
    <form onSubmit={submit} className="space-y-3.5" aria-label="Research request">
      <div>
        <p className="mb-1.5 text-[12.5px] font-medium text-muted" id={`${ids}-mode`}>Mode</p>
        <ModePicker options={MODE_OPTIONS} value={mode} onChange={setMode} labelledBy={`${ids}-mode`} />
        {hint && <p className="mt-1.5 text-[12px] text-faint">{hint}</p>}
      </div>

      {maxSymbols > 0 && (
        <TickerChips value={symbols} onChange={setSymbols} max={maxSymbols} label={maxSymbols === 1 ? "Ticker" : `Tickers (up to ${maxSymbols})`} />
      )}
      {notice && <p className="text-[12px] text-muted">{notice}</p>}

      {mode === "explain_move" && (
        <div>
          <p className="mb-1.5 text-[12.5px] font-medium text-muted">Window</p>
          <Segmented options={WINDOW_OPTIONS} value={moveWindow} onChange={setMoveWindow} label="Move window" />
        </div>
      )}

      {mode === "challenge" && (
        <div>
          <label htmlFor={`${ids}-thesis`} className="mb-1.5 block text-[12.5px] font-medium text-muted">Your thesis</label>
          <textarea id={`${ids}-thesis`} value={thesis} onChange={(e) => setThesis(e.target.value)} maxLength={MAX_THESIS_CHARS} rows={compact ? 4 : 6} placeholder="e.g. Margins will keep expanding because..." className={`${field} resize-y`} />
          <p className="mt-1 text-right text-[11.5px] text-faint num">{thesis.length} / {MAX_THESIS_CHARS}</p>
        </div>
      )}

      <div>
        <label htmlFor={`${ids}-q`} className="mb-1.5 block text-[12.5px] font-medium text-muted">{questionLabel}</label>
        <textarea id={`${ids}-q`} value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={MAX_QUESTION_CHARS} rows={compact ? 2 : 3} placeholder={questionPlaceholder} className={`${field} resize-y`} />
      </div>

      {active ? (
        <PortfolioToggle on={portfolioOn} onToggle={setPortfolioOn} onSummary={onSummary} compact={compact} />
      ) : null}

      {problem && <p className="text-[12.5px] text-down" role="alert">{problem}</p>}
      <button type="submit" disabled={busy} className="inline-flex h-10 w-full cursor-pointer items-center justify-center rounded-xl bg-fg px-4 text-[13.5px] font-semibold text-bg transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-50">
        {busy ? "Researching..." : "Run research"}
      </button>
    </form>
  );
}
