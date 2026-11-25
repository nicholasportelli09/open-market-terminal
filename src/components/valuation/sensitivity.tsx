"use client";

import { useMemo, useState } from "react";
import { centeredRange, sensitivityGrid, type DcfInputs } from "@/lib/valuation";
import { Panel, Segmented } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/states";
import { friendlyErrors } from "./errors";
import { fmtPerShare, fmtRate } from "./fmt";

type Width = "narrow" | "wide";
const WIDTHS: readonly { id: Width; label: string }[] = [
  { id: "narrow", label: "Narrow" },
  { id: "wide", label: "Wide" },
];
/** Half-widths and steps (decimals): WACC rows, terminal growth columns, 5 x 5 cells. */
const AXES: Record<Width, { wacc: [number, number]; growth: [number, number] }> = {
  narrow: { wacc: [0.01, 0.005], growth: [0.005, 0.0025] },
  wide: { wacc: [0.02, 0.01], growth: [0.01, 0.005] },
};

type SensitivityProps = { inputs: DcfInputs | null; price: number | null; currency: string };

function cellTone(v: number | null, price: number | null): string {
  if (v === null || price === null) return "";
  return v >= price ? "bg-up-soft text-up" : "bg-down-soft text-down";
}

/** Per-share value across WACC (rows) and terminal growth (columns), centred on the current assumptions. */
export function Sensitivity({ inputs, price, currency }: SensitivityProps) {
  const [width, setWidth] = useState<Width>("wide");
  const grid = useMemo(() => {
    if (!inputs) return null;
    const a = AXES[width];
    return sensitivityGrid(inputs, {
      waccValues: centeredRange(inputs.wacc, a.wacc[0], a.wacc[1]),
      growthValues: centeredRange(inputs.terminalGrowth, a.growth[0], a.growth[1]),
    });
  }, [inputs, width]);

  return (
    <Panel title="Sensitivity" action={<Segmented options={WIDTHS} value={width} onChange={setWidth} label="Range width" />}>
      {!inputs || !grid ? (
        <EmptyState title="Complete the model first" body="The table re-runs your DCF at nearby WACC and terminal growth values." />
      ) : !grid.ok ? (
        <ul className="list-disc space-y-1 px-8 py-4 text-[13px] text-muted">{friendlyErrors(grid.errors).map((e) => <li key={e}>{e}</li>)}</ul>
      ) : (
        <>
          <div className="relative overflow-x-auto px-4 pt-4">
            <table className="w-full min-w-[520px] border-separate border-spacing-1 text-[13px]">
              <caption className="sr-only">Value per share by WACC and terminal growth</caption>
              <thead>
                <tr>
                  <th scope="col" className="px-2 py-1 text-left text-[11.5px] font-medium text-faint">WACC \ terminal growth</th>
                  {grid.growthValues.map((g) => (
                    <th key={g} scope="col" className={`num px-2 py-1 text-right text-[12px] font-medium ${g === inputs.terminalGrowth ? "text-fg" : "text-muted"}`}>{fmtRate(g, 2)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grid.waccValues.map((w, i) => (
                  <tr key={w}>
                    <th scope="row" className={`num px-2 py-1 text-left text-[12px] font-medium ${w === inputs.wacc ? "text-fg" : "text-muted"}`}>{fmtRate(w, 2)}</th>
                    {grid.values[i].map((v, j) => {
                      const current = w === inputs.wacc && grid.growthValues[j] === inputs.terminalGrowth;
                      return (
                        <td
                          key={j}
                          title={v === null ? "WACC must be above terminal growth" : current ? "Your current assumptions" : undefined}
                          className={`num rounded-md px-2 py-1.5 text-right ${cellTone(v, price)} ${current ? "font-semibold ring-2 ring-fg/50" : ""}`}
                        >
                          {v === null ? "n/a" : fmtPerShare(v, currency)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="px-4 py-3 text-[11.5px] text-faint">
            {price === null
              ? "No comparable live price, so cells are not coloured."
              : `Green cells are at or above the price (${fmtPerShare(price, currency)}), red cells below. `}
            The outlined cell is your current WACC and terminal growth; everything else in your model is held fixed.
          </p>
        </>
      )}
    </Panel>
  );
}
