"use client";

import { useEffect, useRef, useState } from "react";
import { INDICATORS, INDICATOR_COLORS, type IndicatorId } from "./chart-indicators";

type IndicatorMenuProps = {
  selected: readonly IndicatorId[];
  onToggle: (id: IndicatorId) => void;
};

/** "Indicators" button with a checklist, followed by one removable chip per active indicator (doubles as the colour key). */
export function IndicatorMenu({ selected, onToggle }: IndicatorMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      <div ref={ref} className="relative">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-haspopup="true"
          className={`flex min-h-8 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] font-medium transition-colors sm:min-h-[30px] ${
            open ? "bg-hover text-fg" : "text-muted hover:bg-hover hover:text-fg"
          }`}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path d="M3 17l5-6 4 4 8-10" />
          </svg>
          Indicators
        </button>
        {open && (
          <div className="absolute left-0 top-full z-30 mt-1 w-60 rounded-xl border border-line bg-card p-1 shadow-[0_10px_30px_rgba(0,0,0,0.12)]" role="group" aria-label="Indicators">
            {INDICATORS.map((ind) => {
              const on = selected.includes(ind.id);
              return (
                <label key={ind.id} title={ind.hint} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] hover:bg-hover">
                  <input type="checkbox" checked={on} onChange={() => onToggle(ind.id)} className="h-3.5 w-3.5 cursor-pointer accent-[var(--fg)]" />
                  <span className="h-0.5 w-3.5 rounded-full" style={{ background: INDICATOR_COLORS[ind.id] }} aria-hidden />
                  <span className={on ? "text-fg" : "text-muted"}>{ind.label}</span>
                </label>
              );
            })}
          </div>
        )}
      </div>
      {INDICATORS.filter((i) => selected.includes(i.id)).map((ind) => (
        <button
          key={ind.id}
          type="button"
          onClick={() => onToggle(ind.id)}
          title={`Remove ${ind.label}`}
          aria-label={`Remove ${ind.label}`}
          className="group flex h-7 cursor-pointer items-center gap-1.5 rounded-md bg-hover px-2 text-[11.5px] font-medium text-muted hover:text-fg"
        >
          <span className="h-0.5 w-3 rounded-full" style={{ background: INDICATOR_COLORS[ind.id] }} aria-hidden />
          {ind.label}
          <span className="text-faint group-hover:text-fg" aria-hidden>×</span>
        </button>
      ))}
    </div>
  );
}
