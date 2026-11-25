"use client";

import { useState, type FormEvent } from "react";
import { Panel } from "@/components/ui/panel";
import type { FailedRow } from "@/lib/scanner/types";
import { MAX_EXTRA_TICKERS, SP100, normalizeTicker } from "@/lib/scanner/universe";

type ExtrasPanelProps = { extras: string[]; failed: FailedRow[]; onChange: (extras: string[]) => void };

const inputCls = "h-8 min-w-0 flex-1 rounded-lg border border-line bg-card px-2.5 text-[13px] uppercase placeholder:normal-case placeholder:text-faint";
const btn = "inline-flex h-8 shrink-0 cursor-pointer items-center rounded-lg border border-line px-3 text-[12.5px] font-medium text-muted hover:bg-hover hover:text-fg disabled:cursor-default disabled:opacity-50";

export function ExtrasPanel({ extras, failed, onChange }: ExtrasPanelProps) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const full = extras.length >= MAX_EXTRA_TICKERS;

  const add = (e: FormEvent) => {
    e.preventDefault();
    const t = normalizeTicker(text);
    if (!t) return setError("Enter a US ticker such as SHOP or BRK.B.");
    if (SP100.includes(t)) return setError(`${t} is already in the S&P 100 screen.`);
    if (extras.includes(t)) return setError(`${t} is already added.`);
    if (full) return setError(`You can add up to ${MAX_EXTRA_TICKERS} tickers.`);
    setError(null);
    setText("");
    onChange([...extras, t]);
  };
  const failedExtra = new Map(failed.filter((f) => f.extra).map((f) => [f.symbol, f.reason]));

  return (
    <Panel title="Your tickers">
      <div className="space-y-2.5 px-4 py-3">
        <form onSubmit={add} className="flex gap-2">
          <label htmlFor="extra-ticker" className="sr-only">
            Add a US ticker to the screen
          </label>
          <input id="extra-ticker" value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a US ticker" maxLength={8} className={inputCls} autoComplete="off" />
          <button type="submit" className={btn} disabled={full || !text.trim()}>
            Add
          </button>
        </form>
        {error && <p className="text-[12px] text-down" role="alert">{error}</p>}
        {extras.length === 0 ? (
          <p className="text-[12px] text-faint">Add up to {MAX_EXTRA_TICKERS} US-listed companies to rank them against the index. Saved on this device.</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {extras.map((t) => (
              <li key={t} className="inline-flex h-7 items-center gap-1 rounded-md border border-line pl-2 text-[12px]" title={failedExtra.get(t)}>
                <span className={`num font-medium ${failedExtra.has(t) ? "text-down" : ""}`}>{t}</span>
                <button type="button" onClick={() => onChange(extras.filter((x) => x !== t))} aria-label={`Remove ${t}`} className="inline-flex h-7 w-6 cursor-pointer items-center justify-center rounded-r-md text-faint hover:bg-hover hover:text-fg">
                  <span aria-hidden>×</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {extras.length > 0 && <p className="text-[11.5px] text-faint">{extras.length} of {MAX_EXTRA_TICKERS} · added tickers are screened with the index</p>}
      </div>
    </Panel>
  );
}
