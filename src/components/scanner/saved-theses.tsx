"use client";

import { Panel } from "@/components/ui/panel";
import { fmtAsOf } from "@/lib/format";
import type { ThesisResult } from "@/lib/scanner/thesis";

type SavedThesesProps = { theses: ThesisResult[]; onOpen: (t: ThesisResult) => void; onDelete: (t: ThesisResult) => void; storageError: boolean };

const btn = "inline-flex h-7 cursor-pointer items-center rounded-md px-2 text-[12px] font-medium text-muted hover:bg-hover hover:text-fg";

/** Theses saved on this device (localStorage terminal.theses.v1). */
export function SavedTheses({ theses, onOpen, onDelete, storageError }: SavedThesesProps) {
  return (
    <Panel title="Saved theses">
      {storageError && <p className="px-4 pt-3 text-[12px] text-down" role="alert">This browser blocked saving; the last thesis is shown but not stored.</p>}
      {theses.length === 0 ? (
        <p className="px-4 py-4 text-[12.5px] text-muted">Generated theses are kept on this device. None yet.</p>
      ) : (
        <ul>
          {theses.map((t) => (
            <li key={`${t.symbol}-${t.generatedAt}`} className="flex items-center gap-2 border-b border-line px-4 py-2 last:border-0">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px]">
                  <span className="num font-semibold">{t.symbol}</span> <span className="text-muted">{t.name}</span>
                </p>
                <p className="text-[11.5px] text-faint">{fmtAsOf(t.generatedAt)}</p>
              </div>
              <button type="button" className={btn} onClick={() => onOpen(t)} aria-label={`Open thesis for ${t.symbol} from ${fmtAsOf(t.generatedAt)}`}>
                Open
              </button>
              <button type="button" className={btn} onClick={() => onDelete(t)} aria-label={`Delete thesis for ${t.symbol} from ${fmtAsOf(t.generatedAt)}`}>
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
