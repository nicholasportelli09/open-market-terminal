import { direction, fmtChange, fmtPct } from "@/lib/format";

type ChangeProps = {
  change?: number | null;
  pct: number | null | undefined;
  decimals?: number;
  /** Show the absolute change in basis points (yields). */
  isYield?: boolean;
  variant?: "text" | "pill";
  className?: string;
};

const ARROW = { up: "▲", down: "▼", flat: "" } as const;

/** Colour and arrow follow the percent change, falling back to the absolute change when it is missing. */
export function Change({ change, pct, decimals = 2, isYield = false, variant = "text", className = "" }: ChangeProps) {
  const dir = direction(pct ?? change);
  const color = dir === "up" ? "text-up" : dir === "down" ? "text-down" : "text-muted";
  if (variant === "pill") {
    const bg = dir === "up" ? "bg-up-soft" : dir === "down" ? "bg-down-soft" : "bg-hover";
    return (
      <span className={`num inline-flex min-w-[68px] justify-end rounded-md px-1.5 py-0.5 text-[13px] font-medium ${bg} ${color} ${className}`}>
        {fmtPct(pct)}
      </span>
    );
  }
  return (
    <span className={`num ${color} ${className}`}>
      {change !== undefined && <>{fmtChange(change, decimals, isYield)} </>}
      <span className="whitespace-nowrap">
        {ARROW[dir] && <span className="mr-0.5 text-[0.7em]">{ARROW[dir]}</span>}
        {change !== undefined ? `(${fmtPct(pct)})` : fmtPct(pct)}
      </span>
    </span>
  );
}
