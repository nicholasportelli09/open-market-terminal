"use client";

import { useEffect, useRef, useState } from "react";
import { fmtPrice } from "@/lib/format";

type PriceProps = {
  value: number | null | undefined;
  decimals: number;
  isYield?: boolean;
  className?: string;
};

/** A live number that briefly flashes green/red when it ticks. */
export function Price({ value, decimals, isYield, className = "" }: PriceProps) {
  const prev = useRef(value);
  const [flash, setFlash] = useState<{ dir: "up" | "down"; key: number } | null>(null);

  useEffect(() => {
    const before = prev.current;
    prev.current = value;
    if (before == null || value == null || before === value) return;
    setFlash((f) => ({ dir: value > before ? "up" : "down", key: (f?.key ?? 0) + 1 }));
  }, [value]);

  return (
    <span
      key={flash?.key}
      className={`num -mx-1 rounded px-1 ${flash ? `flash-${flash.dir}` : ""} ${className}`}
    >
      {fmtPrice(value, decimals, isYield)}
    </span>
  );
}
