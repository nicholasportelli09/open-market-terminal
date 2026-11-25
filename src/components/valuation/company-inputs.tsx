"use client";

import type { CompanySnapshot } from "@/lib/company-types";
import { Panel } from "@/components/ui/panel";
import { SourceTag } from "@/components/ui/source-tag";
import { fmtMoney, fmtRate } from "./fmt";
import type { LabCtx } from "./lab-model";
import type { Seed, SeedKey } from "./seed";
import { SourcedField } from "./sourced-field";
import type { FieldUnit } from "./field";

type Row = { key: SeedKey; label: string; unit: FieldUnit; decimals: number; note?: string };

const ROWS: Row[] = [
  { key: "baseRevenue", label: "Base revenue (TTM)", unit: "millions", decimals: 0 },
  { key: "sharesDiluted", label: "Share count", unit: "millions", decimals: 1 },
  { key: "netDebt", label: "Net debt (negative = net cash)", unit: "millions", decimals: 0 },
  { key: "taxRate", label: "Tax rate", unit: "pct", decimals: 1, note: "Used in Fundamental mode and for the after-tax cost of debt." },
  { key: "salesToCapital", label: "Sales to capital", unit: "ratio", decimals: 2, note: "Fundamental mode: revenue added per unit of new capital." },
];

function Fact({ label, seed, format }: { label: string; seed: Seed; format: (v: number | null) => string }) {
  return (
    <div className="min-w-0">
      <p className="text-[12px] text-muted">{label}</p>
      <p className="num mt-0.5 text-[15px] font-medium">{format(seed.value)}</p>
      {seed.value === null ? (
        <p className="text-[11.5px] text-faint">{seed.reason ?? "Not reported"}</p>
      ) : (
        <SourceTag provenance={seed.provenance} />
      )}
    </div>
  );
}

/** Seeded company inputs (each sourced and overridable) plus the TTM reference figures that seed the forecast. */
export function CompanyInputs({ state, update, seed, snapshot }: LabCtx & { snapshot: CompanySnapshot }) {
  const cur = snapshot.currency;
  const setOverride = (key: SeedKey, v: number | null) =>
    update((s) => {
      const rest = Object.fromEntries(Object.entries(s.overrides).filter(([k]) => k !== key));
      return { ...s, overrides: v === null ? rest : { ...rest, [key]: v } };
    });

  return (
    <Panel title="Company inputs" action={<span className="text-[12px] text-faint">Money and shares in millions, {cur}</span>}>
      <div className="grid gap-x-5 gap-y-4 px-4 py-4 sm:grid-cols-2">
        {ROWS.map((r) => (
          <div key={r.key} className="min-w-0">
            <SourcedField
              label={r.label}
              sourced={seed[r.key].value}
              provenance={seed[r.key].provenance}
              reason={seed[r.key].reason}
              override={state.overrides[r.key]}
              onOverride={(v) => setOverride(r.key, v)}
              unit={r.unit}
              decimals={r.decimals}
            />
            {r.note && <p className="mt-0.5 text-[11.5px] text-faint">{r.note}</p>}
          </div>
        ))}
      </div>
      <div className="border-t border-line px-4 py-4">
        <p className="mb-3 text-[12px] font-medium uppercase tracking-[0.06em] text-faint">Trailing twelve months, reference</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Fact label="Free cash flow" seed={seed.fcfTTM} format={(v) => fmtMoney(v, cur)} />
          <Fact label="FCF margin (seeds FCF mode)" seed={seed.fcfMargin} format={(v) => fmtRate(v)} />
          <Fact label="Operating margin (seeds EBIT mode)" seed={seed.ebitMargin} format={(v) => fmtRate(v)} />
        </div>
        <p className="mt-3 text-[11.5px] text-faint">
          The share count is the latest cover-page count of shares outstanding from SEC filings; diluted shares are not reported there, so dilution from options and RSUs is not included unless you enter it.
        </p>
      </div>
    </Panel>
  );
}
