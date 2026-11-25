"use client";

import { useId, useState } from "react";

/**
 * Number input that edits a decimal value in friendly units: "pct" shows 0.085 as 8.5, "millions" shows
 * 478834000000 as 478,834. Invalid text stays in the box (marked) and is never committed.
 */
export type FieldUnit = "pct" | "millions" | "ratio";

const SCALE: Record<FieldUnit, number> = { pct: 100, millions: 1e-6, ratio: 1 };
const SUFFIX: Record<FieldUnit, string> = { pct: "%", millions: "M", ratio: "x" };

function toText(v: number | null, unit: FieldUnit, decimals: number): string {
  if (v === null || !Number.isFinite(v)) return "";
  const shown = v * SCALE[unit];
  return Number(shown.toFixed(decimals)).toLocaleString("en-US", { maximumFractionDigits: decimals, useGrouping: unit === "millions" });
}

function parse(text: string): number | null | "invalid" {
  const t = text.trim().replace(/,/g, "").replace(/%$/, "").replace(/^−/, "-");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : "invalid";
}

const close = (a: number | null, b: number | null) =>
  a === b || (a !== null && b !== null && Math.abs(a - b) <= Math.max(Math.abs(b), 1) * 1e-9);

export type NumberFieldProps = {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  unit: FieldUnit;
  decimals?: number;
  /** Visually hide the label (tables); it stays for screen readers. */
  hideLabel?: boolean;
  allowEmpty?: boolean;
  placeholder?: string;
  className?: string;
  /** Marks the box as the user's own value. */
  assumption?: boolean;
  invalid?: boolean;
};

export function NumberField({
  label,
  value,
  onChange,
  unit,
  decimals = 2,
  hideLabel = false,
  allowEmpty = false,
  placeholder,
  className = "",
  assumption = false,
  invalid = false,
}: NumberFieldProps) {
  const id = useId();
  const [draft, setDraft] = useState(() => toText(value, unit, decimals));
  const [seen, setSeen] = useState(value);
  const [bad, setBad] = useState(false);

  // An outside change (reset, load, scenario prefill) replaces the text unless it already says the same.
  if (!close(value, seen)) {
    setSeen(value);
    const p = parse(draft);
    if (p === "invalid" || !close(p === null ? null : p / SCALE[unit], value)) {
      setDraft(toText(value, unit, decimals));
      setBad(false);
    }
  }

  const commit = (text: string) => {
    setDraft(text);
    const p = parse(text);
    if (p === "invalid" || (p === null && !allowEmpty)) {
      setBad(true);
      return;
    }
    setBad(false);
    const next = p === null ? null : p / SCALE[unit];
    setSeen(next);
    onChange(next);
  };

  const ring = bad || invalid ? "border-down" : assumption ? "border-accent/60" : "border-line";
  return (
    <span className={`flex flex-col gap-1 ${className}`}>
      <label htmlFor={id} className={hideLabel ? "sr-only" : "text-[12.5px] text-muted"}>
        {label}
      </label>
      <span className={`flex h-9 items-center rounded-lg border bg-surface px-2.5 focus-within:border-line-strong focus-within:bg-card ${ring}`}>
        <input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          value={draft}
          placeholder={placeholder}
          aria-invalid={bad || invalid || undefined}
          onChange={(e) => commit(e.target.value)}
          onBlur={() => {
            if (!bad) setDraft(toText(value, unit, decimals));
          }}
          className="num min-w-0 flex-1 bg-transparent text-right text-[13.5px] outline-none placeholder:text-faint"
        />
        <span className="ml-1.5 shrink-0 text-[12px] text-faint" aria-hidden>
          {SUFFIX[unit]}
        </span>
      </span>
    </span>
  );
}

/** "Your assumption" marker used next to every value the user typed or every default assumption. */
export function AssumptionTag({ children = "Your assumption" }: { children?: string }) {
  return <span className="text-[11.5px] font-medium text-accent">{children}</span>;
}

export const smallBtn =
  "inline-flex h-7 cursor-pointer items-center rounded-md px-2 text-[12px] font-medium text-muted transition-colors hover:bg-hover hover:text-fg";
export const actionBtn =
  "inline-flex h-9 cursor-pointer items-center rounded-lg border border-line px-3 text-[13px] font-medium text-muted transition-colors hover:bg-hover hover:text-fg disabled:cursor-not-allowed disabled:opacity-50";
