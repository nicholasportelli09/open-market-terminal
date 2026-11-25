"use client";

import type { Provenance } from "@/lib/provenance";
import { SourceTag } from "@/components/ui/source-tag";
import { AssumptionTag, NumberField, smallBtn, type FieldUnit } from "./field";

type SourcedFieldProps = {
  label: string;
  /** The sourced value (null when the source has none). */
  sourced: number | null;
  provenance: Provenance | null;
  /** Why the sourced value is missing. */
  reason?: string;
  /** The user's value; undefined / null = use the sourced value. */
  override: number | null | undefined;
  onOverride: (v: number | null) => void;
  unit: FieldUnit;
  decimals?: number;
  /** Shown under the field when the value is a default assumption rather than sourced. */
  hint?: string;
  invalid?: boolean;
};

/**
 * An input seeded from a sourced figure. The source line stays visible; once the user types a different
 * value the field is marked "Your assumption" and offers a way back to the sourced value.
 */
export function SourcedField({ label, sourced, provenance, reason, override, onOverride, unit, decimals = 2, hint, invalid }: SourcedFieldProps) {
  const own = override !== undefined && override !== null;
  const value = own ? override : sourced;
  return (
    <div className="min-w-0">
      <NumberField
        label={label}
        value={value}
        unit={unit}
        decimals={decimals}
        allowEmpty
        assumption={own}
        invalid={invalid}
        placeholder={sourced === null ? "Enter a value" : undefined}
        onChange={(v) => onOverride(v === null || (sourced !== null && Math.abs(v - sourced) <= Math.abs(sourced) * 1e-9) ? null : v)}
      />
      <div className="mt-1 flex min-h-5 flex-wrap items-center gap-x-2 gap-y-0.5">
        {own ? (
          <>
            <AssumptionTag />
            {sourced !== null && (
              <button type="button" className={`${smallBtn} h-5 px-1`} onClick={() => onOverride(null)}>
                Use sourced value
              </button>
            )}
          </>
        ) : sourced === null ? (
          <span className="text-[11.5px] text-muted">{reason ? `Not available: ${reason}.` : "Not available."} Enter your own.</span>
        ) : provenance ? (
          <SourceTag provenance={provenance} />
        ) : null}
        {!own && hint && <AssumptionTag>{hint}</AssumptionTag>}
      </div>
    </div>
  );
}
