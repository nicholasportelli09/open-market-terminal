"use client";

import { useState } from "react";
import { displayTicker } from "@/lib/instruments";
import { fmtAsOf } from "@/lib/format";
import { MODE_OPTIONS } from "./research-form";
import { researchHistory, useResearchHistory, type HistoryEntry } from "./history";

type Props = { activeId?: string; onOpen: (e: HistoryEntry) => void };

/** Saved research on this device, newest first, with open and delete. */
export function HistoryList({ activeId, onOpen }: Props) {
  const entries = useResearchHistory();
  const [confirming, setConfirming] = useState(false);
  if (entries.length === 0) {
    return <p className="px-4 py-5 text-[12.5px] text-faint">Answers you run are saved here, and sync to your account when signed in.</p>;
  }
  return (
    <div>
      <ul>
        {entries.map((e) => {
          const mode = MODE_OPTIONS.find((m) => m.id === e.mode)?.label ?? e.mode;
          const title = [mode, e.symbols.map(displayTicker).join(", ")].filter(Boolean).join(" · ");
          return (
            <li key={e.id} className={`flex items-center gap-1 border-b border-line last:border-0 ${e.id === activeId ? "bg-hover" : ""}`}>
              <button type="button" onClick={() => onOpen(e)} className="min-w-0 flex-1 cursor-pointer px-4 py-2.5 text-left hover:bg-hover" aria-current={e.id === activeId ? "true" : undefined}>
                <span className="block truncate text-[13px] font-medium">{title}</span>
                <span className="block truncate text-[11.5px] text-faint">{e.question || e.thesis || "No question"} · {fmtAsOf(e.createdAt)}</span>
              </button>
              <button type="button" onClick={() => researchHistory.remove(e.id)} aria-label={`Delete ${title} from history`} title="Delete" className="mr-2 grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-lg text-faint hover:bg-hover hover:text-down">
                <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden><path d="M2.5 4h9M5.5 4V2.5h3V4M3.5 4l.6 7.5h5.8l.6-7.5" /></svg>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="border-t border-line px-4 py-2.5">
        {confirming ? (
          <span className="flex flex-wrap items-center gap-3 text-[12px]">
            <span className="text-muted">Delete all {entries.length} saved answers?</span>
            <button type="button" onClick={() => { researchHistory.clear(); setConfirming(false); }} className="cursor-pointer font-semibold text-down hover:underline">Delete all</button>
            <button type="button" onClick={() => setConfirming(false)} className="cursor-pointer font-medium text-muted hover:text-fg">Keep</button>
          </span>
        ) : (
          <button type="button" onClick={() => setConfirming(true)} className="cursor-pointer text-[12px] font-medium text-muted hover:text-down">Clear history</button>
        )}
      </div>
    </div>
  );
}
