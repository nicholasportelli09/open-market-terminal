"use client";

import { useRef } from "react";
import type { ResearchMode } from "@/lib/server/research/types";

type Props = {
  options: readonly { id: ResearchMode; label: string }[];
  value: ResearchMode;
  onChange: (m: ResearchMode) => void;
  labelledBy: string;
};

/** Six research modes as a wrapping 3x2 radio grid (a single scrolling row hides modes in narrow columns). */
export function ModePicker({ options, value, onChange, labelledBy }: Props) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: React.KeyboardEvent, i: number) => {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (i + step + options.length) % options.length;
    onChange(options[next].id);
    refs.current[next]?.focus();
  };
  return (
    <div role="radiogroup" aria-labelledby={labelledBy} className="grid grid-cols-3 gap-0.5 rounded-lg bg-hover p-0.5">
      {options.map((o, i) => {
        const active = o.id === value;
        return (
          <button
            key={o.id}
            ref={(el) => { refs.current[i] = el; }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(o.id)}
            onKeyDown={(e) => onKey(e, i)}
            className={`min-h-8 cursor-pointer truncate rounded-md px-2 py-1 text-[12.5px] font-medium transition-colors ${
              active ? "bg-card text-fg shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-muted hover:text-fg"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
