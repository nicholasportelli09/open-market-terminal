"use client";

import type { ReactNode } from "react";
import type { ScenariosResult } from "@/lib/valuation";
import { Panel } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/states";
import { friendlyErrors } from "./errors";
import { NumberField, smallBtn } from "./field";
import { fmtPerShare, fmtRate, fmtSignedRate, toneClass } from "./fmt";
import { CASE_GROWTH_SHIFT, CASE_WACC_SHIFT, defaultScenarios, startingCases, type LabCtx, type ScenarioDraft } from "./lab-model";

type ScenariosProps = LabCtx & { run: ScenariosResult | null; baseWacc: number | null; hasPrice: boolean };

type DraftKey = "growth" | "margin" | "wacc" | "terminalGrowth" | "weight";

function Head({ children, sub }: { children: ReactNode; sub?: string }) {
  return (
    <th scope="row" className="sticky left-0 z-10 bg-card px-4 py-1.5 text-left text-[12.5px] font-medium text-muted">
      {children}
      {sub && <span className="block text-[11px] font-normal text-faint">{sub}</span>}
    </th>
  );
}

/** Bear / base / bull cases as overrides on the base model, with user probability weights. */
export function ScenariosPanel({ state, update, currency, run, baseWacc, hasPrice }: ScenariosProps) {
  const marginName = state.mode === "fcfMargin" ? "FCF margin" : "EBIT margin";
  const setDraft = (id: ScenarioDraft["id"], key: DraftKey, v: number | null) =>
    update((s) => ({ ...s, scenarios: s.scenarios.map((d) => (d.id === id ? { ...d, [key]: v } : d)) }));
  const weightSum = state.scenarios.reduce((t, d) => t + (d.weight ?? 0), 0);
  const runs = run?.ok ? run.scenarios : [];
  const runOf = (id: string) => runs.find((r) => r.id === id);

  const inputRow = (key: DraftKey, label: string, sub: string, decimals = 1) => (
    <tr className="border-t border-line">
      <Head sub={sub}>{label}</Head>
      {state.scenarios.map((d) => (
        <td key={d.id} className="px-1.5 py-1">
          <NumberField
            label={`${d.label}: ${label}`}
            hideLabel
            unit="pct"
            decimals={decimals}
            value={d[key]}
            allowEmpty
            assumption={d[key] !== null}
            placeholder={key === "weight" ? "0" : "Base"}
            onChange={(v) => setDraft(d.id, key, v)}
            className="ml-auto w-full max-w-[150px]"
          />
        </td>
      ))}
    </tr>
  );

  const errors = run && !run.ok
    ? friendlyErrors(run.errors)
    : runs.flatMap((r) => (r.result.ok ? [] : friendlyErrors(r.result.errors).map((e) => `${r.label}: ${e}`)));
  return (
    <Panel
      title="Scenarios"
      action={
        <span className="flex gap-1">
          <button type="button" className={smallBtn} onClick={() => update((s) => ({ ...s, scenarios: startingCases(s, baseWacc) }))}>
            Fill bear and bull
          </button>
          <button type="button" className={smallBtn} onClick={() => update((s) => ({ ...s, scenarios: defaultScenarios() }))}>
            Clear
          </button>
        </span>
      }
    >
      {!run ? (
        <EmptyState title="Complete the model first" body="Scenarios change your base model, so it needs every input." />
      ) : (
        <>
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[520px] table-fixed text-[13px]">
              <caption className="sr-only">Scenario inputs and values</caption>
              <thead className="text-[12px] text-muted">
                <tr>
                  <th scope="col" className="sticky left-0 z-10 w-[34%] bg-card px-4 py-2 text-left font-medium text-faint">Override (blank = base)</th>
                  {state.scenarios.map((d) => (
                    <th key={d.id} scope="col" className="px-2 py-2 text-right font-semibold text-fg">{d.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {inputRow("growth", "Revenue growth", "Same every year")}
                {inputRow("margin", marginName, "Same every year")}
                {inputRow("wacc", "WACC", "Discount rate", 2)}
                {inputRow("terminalGrowth", "Terminal growth", "After the forecast", 2)}
                {inputRow("weight", "Probability", "Your weight, total 100%", 2)}
                <tr className="border-t border-line bg-surface/60">
                  <Head>Value per share</Head>
                  {state.scenarios.map((d) => (
                    <td key={d.id} className="num px-2 py-2 text-right text-[14px] font-semibold">{fmtPerShare(runOf(d.id)?.perShare, currency)}</td>
                  ))}
                </tr>
                <tr className="border-t border-line">
                  <Head>Upside vs price</Head>
                  {state.scenarios.map((d) => {
                    const up = runOf(d.id)?.upside ?? null;
                    return <td key={d.id} className={`num px-2 py-2 text-right ${toneClass(up)}`}>{hasPrice ? fmtSignedRate(up) : "—"}</td>;
                  })}
                </tr>
              </tbody>
            </table>
          </div>
          <div className="space-y-1.5 border-t border-line px-4 py-3 text-[12.5px]">
            {!run.ok ? null : run.weighted.ok ? (
              <p className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-muted">Probability-weighted value</span>
                <span className="num text-[16px] font-semibold">{fmtPerShare(run.weighted.value, currency)}</span>
                <span className="text-faint">weights total {fmtRate(weightSum, 2)}</span>
                {run.weighted.upside !== null && <span className={`num ${toneClass(run.weighted.upside)}`}>{fmtSignedRate(run.weighted.upside)} vs price</span>}
              </p>
            ) : (
              <p className="text-muted">
                Your weights add up to <span className="num font-medium text-fg">{fmtRate(weightSum, 0)}</span>.{" "}
                {Math.abs(weightSum - 1) > 1e-9 ? "Make them total 100% to see a weighted value." : run.weighted.message}
              </p>
            )}
            {errors.map((e) => <p key={e} className="text-down">{e}</p>)}
            <p className="text-[11.5px] text-faint">
              Every override and weight is your assumption. &quot;Fill bear and bull&quot; starts the cases at your average growth and margin {fmtRate(-CASE_GROWTH_SHIFT, 0)} / +{fmtRate(CASE_GROWTH_SHIFT, 0)} points and WACC +/- {fmtRate(CASE_WACC_SHIFT, 0)} point; weights are never filled in for you.
            </p>
          </div>
        </>
      )}
    </Panel>
  );
}
