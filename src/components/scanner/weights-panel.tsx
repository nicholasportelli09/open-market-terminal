"use client";

import { Panel } from "@/components/ui/panel";
import { DEFAULT_WEIGHTS, FACTORS, MAX_WEIGHT, MIN_FACTORS_FOR_COMPOSITE, type FactorId, type Weights } from "@/lib/scanner/factors";

type WeightsPanelProps = { weights: Weights; onChange: (w: Weights) => void };

const btn = "inline-flex h-7 cursor-pointer items-center rounded-md border border-line px-2 text-[12px] font-medium text-muted hover:bg-hover hover:text-fg disabled:cursor-default disabled:opacity-50";

export function WeightsPanel({ weights, onChange }: WeightsPanelProps) {
  const total = FACTORS.reduce((s, f) => s + weights[f.id], 0);
  const isDefault = FACTORS.every((f) => weights[f.id] === DEFAULT_WEIGHTS[f.id]);
  const set = (id: FactorId, v: number) => onChange({ ...weights, [id]: v });
  return (
    <Panel
      title="Weights"
      action={
        <button type="button" className={btn} disabled={isDefault} onClick={() => onChange(DEFAULT_WEIGHTS)}>
          Equal weights
        </button>
      }
    >
      <div className="grid grid-cols-1 gap-x-6 gap-y-3 px-4 py-3 sm:grid-cols-2 xl:grid-cols-5">
        {FACTORS.map((f) => {
          const share = total > 0 ? Math.round((weights[f.id] / total) * 100) : 0;
          return (
            <div key={f.id}>
              <div className="flex items-baseline justify-between gap-2">
                <label htmlFor={`w-${f.id}`} className="text-[13px] font-medium">
                  {f.label}
                </label>
                <span className="num text-[12px] text-muted">{share}% of composite</span>
              </div>
              <input
                id={`w-${f.id}`}
                type="range"
                min={0}
                max={MAX_WEIGHT}
                step={5}
                value={weights[f.id]}
                onChange={(e) => set(f.id, Number(e.target.value))}
                aria-valuetext={`${weights[f.id]} (${share}% of composite)`}
                className="mt-1 w-full cursor-pointer accent-[var(--fg)]"
              />
              <p className="hidden text-[11.5px] leading-snug text-faint sm:block">{f.summary}</p>
            </div>
          );
        })}
        <p className="border-t border-line pt-3 text-[11.5px] leading-snug text-faint sm:col-span-2 xl:col-span-5">
          Factor scores are percentile ranks (0 to 100) within this screen. The composite is the weighted mean of the factors a company
          has; it needs at least {MIN_FACTORS_FOR_COMPOSITE} factors, each built from at least 2 reported metrics. Missing figures are left
          out, never filled in. These are relative ranks, not forecasts or probabilities.
        </p>
      </div>
    </Panel>
  );
}
