"use client";

import { useId } from "react";
import type { FredRouteSeries } from "@/app/api/fred/route";
import type { ApiState } from "@/lib/client/use-api";
import type { Provenance } from "@/lib/provenance";
import { Panel, Segmented } from "@/components/ui/panel";
import { AssumptionTag, NumberField } from "./field";
import { fmtMoney, fmtRate } from "./fmt";
import { DEFAULT_DEBT_SPREAD, DEFAULT_ERP, sourcedEquity, withTerminalGrowth, type LabCtx, type WaccBreakdown, type WaccDraft } from "./lab-model";
import { SourcedField } from "./sourced-field";
import type { LivePrice } from "./workspace";

export type SourcedValue = { value: number; provenance: Provenance } | null;

type DiscountRateProps = LabCtx & {
  breakdown: WaccBreakdown;
  riskFree: SourcedValue;
  beta: SourcedValue;
  fred: ApiState<FredRouteSeries[]>;
  quoteLoaded: boolean;
  price: LivePrice;
};

const MODES = [
  { id: "builder", label: "Build WACC" },
  { id: "direct", label: "Enter WACC" },
] as const;

function Line({ label, value, children }: { label: string; value: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-1.5">
      <span className="text-[12.5px] text-muted">{label}</span>
      <span className="num text-[13.5px] font-medium">{value}</span>
      {children && <span className="w-full">{children}</span>}
    </div>
  );
}

/** WACC builder (CAPM cost of equity + after-tax cost of debt, market weights) or a direct WACC, plus terminal growth. */
export function DiscountRate({ state, update, seed, currency, breakdown: b, riskFree, beta, fred, quoteLoaded, price }: DiscountRateProps) {
  const midId = useId();
  const w = state.wacc;
  const setW = (patch: Partial<WaccDraft>) => update((s) => ({ ...s, wacc: { ...s.wacc, ...patch } }));
  const fredSeries = fred.data?.find((r) => r.id === "DGS10");
  const rfReason =
    fred.status === "loading" ? "loading the 10-year Treasury yield from FRED"
    : fred.error ? `FRED could not be reached (${fred.error.message})`
    : fredSeries?.error ?? "FRED returned no recent 10-year yield";
  const betaReason = quoteLoaded ? "CNBC has no beta for this stock" : "waiting for the CNBC quote";
  const livePrice = price.comparable ? price.value : null;
  const equity = sourcedEquity(state, seed, livePrice);
  const equityProvenance: Provenance | null = equity.derived
    ? { source: "model", asOf: price.provenance?.asOf ?? seed.sharesDiluted.provenance.asOf, session: "n/a", url: price.provenance?.url, note: "Share count x live price" }
    : seed.marketCap.provenance;
  const equityReason = seed.marketCap.reason ?? (livePrice === null ? "no comparable live price" : "no share count");
  const gTooHigh = b.value !== null && state.terminalGrowth >= b.value;
  const switchMode = (id: "builder" | "direct") =>
    setW(id === "direct" ? { useDirect: true, direct: w.direct ?? b.value } : { useDirect: false });

  return (
    <Panel title="Discount rate" action={<Segmented options={MODES} value={w.useDirect ? "direct" : "builder"} onChange={switchMode} label="How to set WACC" />}>
      {w.useDirect ? (
        <div className="px-4 py-4">
          <NumberField label="WACC" unit="pct" decimals={2} value={w.direct} allowEmpty assumption onChange={(v) => setW({ direct: v })} className="max-w-[220px]" />
          <p className="mt-1"><AssumptionTag /></p>
        </div>
      ) : (
        <div className="grid gap-5 px-4 py-4 md:grid-cols-2">
          <div className="space-y-4">
            <SourcedField label="Risk-free rate (10-year Treasury)" sourced={riskFree?.value ?? null} provenance={riskFree?.provenance ?? null} reason={rfReason} override={w.riskFree} onOverride={(v) => setW({ riskFree: v })} unit="pct" decimals={2} />
            <SourcedField label="Beta" sourced={beta?.value ?? null} provenance={beta?.provenance ?? null} reason={betaReason} override={w.beta} onOverride={(v) => setW({ beta: v })} unit="ratio" decimals={2} />
            <div>
              <NumberField label="Equity risk premium" unit="pct" decimals={2} value={w.erp} onChange={(v) => setW({ erp: v ?? DEFAULT_ERP })} assumption />
              <p className="mt-1"><AssumptionTag>{`Your assumption (default ${fmtRate(DEFAULT_ERP)})`}</AssumptionTag></p>
            </div>
            <div>
              <NumberField
                label="Pre-tax cost of debt"
                unit="pct"
                decimals={2}
                value={b.costOfDebt}
                allowEmpty
                assumption
                onChange={(v) => setW({ costOfDebt: v })}
              />
              <p className="mt-1">
                <AssumptionTag>{w.costOfDebt === null ? `Your assumption: risk-free + ${fmtRate(DEFAULT_DEBT_SPREAD)} by default` : "Your assumption"}</AssumptionTag>
              </p>
            </div>
            <SourcedField label={`Equity, market value (millions, ${currency})`} sourced={equity.value} provenance={equityProvenance} reason={equityReason} override={w.equityValue} onOverride={(v) => setW({ equityValue: v })} unit="millions" decimals={0} />
            <SourcedField label={`Debt, book value (millions, ${currency})`} sourced={seed.totalDebt.value} provenance={seed.totalDebt.provenance} reason={seed.totalDebt.reason} override={w.debtValue} onOverride={(v) => setW({ debtValue: v })} unit="millions" decimals={0} />
          </div>
          <div className="rounded-xl bg-surface px-3.5 py-2.5">
            <Line label="Cost of equity = risk-free + beta x ERP" value={fmtRate(b.costOfEquity, 2)} />
            <Line label="After-tax cost of debt" value={fmtRate(b.costOfDebt === null || b.taxRate === null ? null : b.costOfDebt * (1 - b.taxRate), 2)}>
              <span className="text-[11.5px] text-faint">Tax rate {fmtRate(b.taxRate)} from company inputs</span>
            </Line>
            <Line label={`Equity weight (${fmtRate(b.equityWeight)})`} value={fmtMoney(b.equityValue, currency)} />
            <Line label={`Debt weight (${fmtRate(b.debtWeight)})`} value={fmtMoney(b.debtValue, currency)} />
            <div className="mt-1 flex items-baseline justify-between border-t border-line pt-2">
              <span className="text-[13px] font-medium">WACC</span>
              <span className="num text-[18px] font-semibold">{fmtRate(b.value, 2)}</span>
            </div>
            {b.missing.length > 0 && (
              <p className="mt-1 text-[12px] text-down">
                Missing: {b.missing.join(", ")}. Fill in the fields on the left{b.missing.includes("tax rate") ? " (tax rate is under Company inputs)" : ""}, or choose &quot;Enter WACC&quot; above to type the discount rate directly.
              </p>
            )}
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-start gap-x-6 gap-y-3 border-t border-line px-4 py-4">
        <div>
          <NumberField
            label="Terminal growth (after the forecast)"
            unit="pct"
            decimals={2}
            value={state.terminalGrowth}
            invalid={gTooHigh}
            assumption
            onChange={(v) => v !== null && update((s) => withTerminalGrowth(s, seed, v))}
            className="max-w-[240px]"
          />
          <p className="mt-1">
            {gTooHigh ? (
              <span className="text-[12px] text-down">Must stay below the WACC ({fmtRate(b.value, 2)}).</span>
            ) : (
              <AssumptionTag>Your assumption</AssumptionTag>
            )}
          </p>
        </div>
        <label htmlFor={midId} className="mt-6 flex cursor-pointer items-center gap-2 text-[13px] text-muted">
          <input id={midId} type="checkbox" checked={state.midYear} onChange={(e) => update((s) => ({ ...s, midYear: e.target.checked }))} className="h-4 w-4 cursor-pointer accent-[var(--fg)]" />
          Mid-year discounting (cash arrives mid-year)
        </label>
      </div>
    </Panel>
  );
}
