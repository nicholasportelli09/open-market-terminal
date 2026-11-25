import type { ReactNode } from "react";

/** Shared button looks for the portfolio screens (same shape as the rest of the terminal). */
export const btn =
  "inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-line px-3 text-[13px] font-medium text-muted transition-colors hover:bg-hover hover:text-fg disabled:cursor-not-allowed disabled:opacity-50";
export const btnPrimary =
  "inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-fg px-3.5 text-[13px] font-semibold text-bg transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-50";
export const btnSmall =
  "inline-flex h-8 cursor-pointer items-center whitespace-nowrap rounded-lg border border-line px-2.5 text-[12.5px] font-medium text-muted transition-colors hover:bg-hover hover:text-fg";
export const btnDanger =
  "inline-flex h-8 cursor-pointer items-center whitespace-nowrap rounded-lg border border-down/40 bg-down-soft px-2.5 text-[12.5px] font-semibold text-down transition-colors hover:border-down";
export const inputCls =
  "h-10 w-full min-w-0 rounded-lg border border-line bg-surface px-3 text-[14px] text-fg outline-none transition-colors placeholder:text-faint focus:border-line-strong focus:bg-card aria-[invalid=true]:border-down";

/** Amber note for partial / approximated figures, muted for neutral explanations. */
export function Note({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "warn" | "error" }) {
  const cls =
    tone === "warn"
      ? "border-accent/40 bg-accent/10 text-fg"
      : tone === "error"
        ? "border-down/40 bg-down-soft text-fg"
        : "border-line bg-surface text-muted";
  return <div className={`rounded-xl border px-3.5 py-2.5 text-[12.5px] leading-relaxed ${cls}`}>{children}</div>;
}

export function PartialChip({ title }: { title: string }) {
  return (
    <span title={title} className="inline-flex h-5 items-center rounded-md border border-accent/50 px-1.5 text-[11px] font-semibold text-accent">
      Partial
    </span>
  );
}
