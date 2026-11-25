"use client";

import { useId, type ReactNode } from "react";
import type { DcfMode, DcfResult, DcfRow } from "@/lib/valuation";
import { Panel, Segmented } from "@/components/ui/panel";
import { SourceTag } from "@/components/ui/source-tag";
import { NumberField, smallBtn } from "./field";
import { fmtMoney, fmtRate } from "./fmt";
import { fadeGrowth, LAB_MAX_YEARS, LAB_MIN_YEARS, withMode, withYears, type LabCtx } from "./lab-model";

const MODES: readonly { id: DcfMode; label: string }[] = [
  { id: "fcfMargin", label: "FCF margin" },
  { id: "fundamental", label: "Fundamental" },
];
const YEAR_OPTIONS = Array.from({ length: LAB_MAX_YEARS - LAB_MIN_YEARS + 1 }, (_, i) => LAB_MIN_YEARS + i);
const differs = (a: number | null, b: number | null) => a !== null && (b === null || Math.abs(a - b) > 1e-9);
const replaceAt = (xs: (number | null)[], i: number, v: number | null) => xs.map((x, j) => (j === i ? v : x));

function RowHead({ children, sub }: { children: ReactNode; sub?: string }) {
  return (
    <th scope="row" className="sticky left-0 z-10 bg-card px-4 py-1.5 text-left text-[12.5px] font-medium text-muted">
      {children}
      {sub && <span className="block text-[11px] font-normal text-faint">{sub}</span>}
    </th>
  );
}

type ForecastProps = LabCtx & { dcf: DcfResult | null };

/** Editable per-year growth and margin, with the resulting revenue, cash flow, discount factor and PV rows. */
export function ForecastTable({ state, update, seed, currency, dcf }: ForecastProps) {
  const yearsId = useId();
  const n = state.years;
  const fundamental = state.mode === "fundamental";
  const marginKey = fundamental ? "ebitMargin" : "fcfMargin";
  const marginSeed = fundamental ? seed.ebitMargin : seed.fcfMargin;
  const defaultGrowth = fadeGrowth(seed.startGrowth.value, state.terminalGrowth, n);
  const rows: (DcfRow | null)[] = Array.from({ length: n }, (_, i) => (dcf?.ok ? dcf.rows[i] ?? null : null));
  const money = (v: number | undefined) => (v === undefined ? "—" : fmtMoney(v, currency));

  const setGrowth = (i: number, v: number | null) => update((s) => ({ ...s, growthEdited: true, growth: replaceAt(s.growth, i, v) }));
  const setMargin = (i: number, v: number | null) => update((s) => ({ ...s, [marginKey]: replaceAt(s[marginKey], i, v) }));
  const resetForecast = () =>
    update((s) => ({
      ...s,
      growthEdited: false,
      growth: fadeGrowth(seed.startGrowth.value, s.terminalGrowth, s.years),
      fcfMargin: Array.from({ length: s.years }, () => seed.fcfMargin.value),
      ebitMargin: Array.from({ length: s.years }, () => seed.ebitMargin.value),
    }));

  const computed = (label: string, pick: (r: DcfRow) => string, sub?: string) => (
    <tr className="border-t border-line">
      <RowHead sub={sub}>{label}</RowHead>
      <td className="px-2 py-1.5 text-right text-faint">—</td>
      {rows.map((r, i) => (
        <td key={i} className="num px-2 py-1.5 text-right text-[13px]">{r ? pick(r) : "—"}</td>
      ))}
    </tr>
  );

  return (
    <Panel
      title="Forecast"
      action={
        <button type="button" className={smallBtn} onClick={resetForecast}>
          Reset forecast
        </button>
      }
    >
      <div className="flex flex-wrap items-end gap-4 px-4 pt-4">
        <div className="flex flex-col gap-1">
          <label htmlFor={yearsId} className="text-[12.5px] text-muted">Forecast years</label>
          <select
            id={yearsId}
            value={n}
            onChange={(e) => update((s) => withYears(s, seed, Number(e.target.value)))}
            className="h-9 cursor-pointer rounded-lg border border-line bg-surface px-2.5 text-[13.5px] outline-none focus:border-line-strong"
          >
            {YEAR_OPTIONS.map((y) => (
              <option key={y} value={y}>{y} years</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[12.5px] text-muted">Cash flow method</span>
          <Segmented options={MODES} value={state.mode} onChange={(mode) => update((s) => withMode(s, mode))} label="Cash flow method" />
        </div>
      </div>
      <p className="px-4 pt-2 text-[12px] text-muted">
        {fundamental
          ? "Fundamental: EBIT = revenue x EBIT margin, NOPAT = EBIT x (1 - tax rate), reinvestment = revenue added / sales to capital, FCFF = NOPAT - reinvestment."
          : "FCF margin: free cash flow = revenue x FCF margin each year."}
      </p>
      <div className="relative mt-3 overflow-x-auto border-t border-line">
        <table className="w-full text-[13px]" style={{ minWidth: 180 + 96 * (n + 1) }}>
          <caption className="sr-only">Forecast by year</caption>
          <thead className="text-[11.5px] text-faint">
            <tr>
              <th scope="col" className="sticky left-0 z-10 bg-card px-4 py-2 text-left font-medium">Year</th>
              <th scope="col" className="px-2 py-2 text-right font-medium">Base</th>
              {rows.map((_, i) => (
                <th key={i} scope="col" className="px-2 py-2 text-right font-medium">Y{i + 1}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-line">
              <RowHead sub="Your forecast">Revenue growth</RowHead>
              <td className="px-2 py-1.5 text-right text-faint">—</td>
              {state.growth.slice(0, n).map((g, i) => (
                <td key={i} className="px-1 py-1">
                  <NumberField label={`Revenue growth, year ${i + 1}`} hideLabel unit="pct" decimals={1} value={g} allowEmpty onChange={(v) => setGrowth(i, v)} assumption={state.growthEdited && differs(g, defaultGrowth[i])} className="w-[88px]" />
                </td>
              ))}
            </tr>
            <tr className="border-t border-line">
              <RowHead sub="Your forecast">{fundamental ? "EBIT margin" : "FCF margin"}</RowHead>
              <td className="num px-2 py-1.5 text-right text-faint">{fmtRate(marginSeed.value)}</td>
              {state[marginKey].slice(0, n).map((m, i) => (
                <td key={i} className="px-1 py-1">
                  <NumberField label={`${fundamental ? "EBIT" : "FCF"} margin, year ${i + 1}`} hideLabel unit="pct" decimals={1} value={m} allowEmpty onChange={(v) => setMargin(i, v)} assumption={differs(m, marginSeed.value)} className="w-[88px]" />
                </td>
              ))}
            </tr>
            <tr className="border-t border-line">
              <RowHead>Revenue</RowHead>
              <td className="num px-2 py-1.5 text-right text-muted">{fmtMoney(state.overrides.baseRevenue ?? seed.baseRevenue.value, currency)}</td>
              {rows.map((r, i) => (
                <td key={i} className="num px-2 py-1.5 text-right">{r ? money(r.revenue) : "—"}</td>
              ))}
            </tr>
            {fundamental && computed("EBIT", (r) => money(r.ebit))}
            {fundamental && computed("NOPAT", (r) => money(r.nopat))}
            {fundamental && computed("Reinvestment", (r) => money(r.reinvestment))}
            {computed(fundamental ? "FCFF" : "Free cash flow", (r) => money(r.fcf))}
            {computed("Discount factor", (r) => r.discountFactor.toFixed(3), state.midYear ? "Mid-year" : "Year-end")}
            {computed("Present value", (r) => money(r.pv))}
          </tbody>
        </table>
      </div>
      <div className="space-y-1 border-t border-line px-4 py-3 text-[11.5px] text-faint">
        <p className="flex flex-wrap items-center gap-x-2">
          <span>
            {seed.startGrowth.value === null
              ? "No revenue growth history in the filings, so the seeded growth path is flat at your terminal growth."
              : `Growth starts at the ${seed.startGrowth.label.replace(/^Revenue/, "revenue")} (${fmtRate(seed.startGrowth.value)}) and fades in a straight line to your terminal growth.`}
          </span>
          {seed.startGrowth.value !== null && <SourceTag provenance={seed.startGrowth.provenance} />}
        </p>
        <p className="flex flex-wrap items-center gap-x-2">
          <span>
            {marginSeed.value === null
              ? `No TTM ${fundamental ? "operating" : "FCF"} margin is available (${marginSeed.reason ?? "not reported"}); enter your own margins.`
              : `Margins start at the TTM ${fundamental ? "operating" : "FCF"} margin (${fmtRate(marginSeed.value)}).`}
          </span>
          {marginSeed.value !== null && <SourceTag provenance={marginSeed.provenance} />}
        </p>
        <p>Every forecast cell is your assumption; cells you change from the seeded path are outlined in orange. An empty cell must be filled before the model runs.</p>
      </div>
    </Panel>
  );
}
