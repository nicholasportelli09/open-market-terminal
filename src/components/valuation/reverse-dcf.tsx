"use client";

import { useMemo } from "react";
import { GROWTH_RANGE, impliedGrowth, impliedMargin, MARGIN_RANGE, type DcfInputs, type ImpliedResult } from "@/lib/valuation";
import { Panel } from "@/components/ui/panel";
import { SourceTag } from "@/components/ui/source-tag";
import { EmptyState } from "@/components/ui/states";
import { friendlyErrors } from "./errors";
import { fmtPerShare, fmtRate } from "./fmt";
import type { LivePrice } from "./workspace";

type ReverseProps = { inputs: DcfInputs | null; price: LivePrice; currency: string };

type Outcome = { headline: string | null; value: number | null; detail: string };

function describe<K extends "growth" | "margin">(r: ImpliedResult<K>, key: K, what: string, range: { lo: number; hi: number }, currency: string): Outcome {
  if (r.ok) {
    const note = r.monotonic ? "" : " The value does not move in one direction across this range, but this solution is exact.";
    return { headline: fmtRate(r[key] as number), value: r[key] as number, detail: note };
  }
  if (r.reason === "multiple solutions in range" && r.roots && r.roots.length > 0) {
    const roots = [...r.roots].sort((a, b) => a - b);
    return {
      headline: fmtRate(roots[0]),
      value: roots[0],
      detail: `More than one ${what} fits the price (${roots.map((x) => fmtRate(x)).join(" and ")}); the lower one is shown.`,
    };
  }
  if (r.reason === "no solution in range") {
    const reach = r.reachable ? ` Across that range your model gives ${fmtPerShare(r.reachable.min, currency)} to ${fmtPerShare(r.reachable.max, currency)} per share.` : "";
    return { headline: null, value: null, detail: `No constant ${what} between ${fmtRate(range.lo, 0)} and ${fmtRate(range.hi, 0)} reproduces the price.${reach}` };
  }
  const errors = r.errors?.length ? ` ${friendlyErrors(r.errors).join(" ")}` : "";
  return { headline: null, value: null, detail: `${r.message}${errors}` };
}

function Card({ title, outcome, sentence }: { title: string; outcome: Outcome; sentence: string | null }) {
  return (
    <div className="rounded-xl bg-surface px-3.5 py-3">
      <p className="text-[12px] text-muted">{title}</p>
      <p className="num mt-0.5 text-[22px] font-semibold">{outcome.headline ?? "No solution"}</p>
      {outcome.headline && sentence && <p className="mt-1 text-[12.5px] text-muted">{sentence}</p>}
      {outcome.detail && <p className="mt-1 text-[12px] text-muted">{outcome.detail}</p>}
    </div>
  );
}

/** What the live price implies: the constant revenue growth, or the constant margin, that makes the DCF equal it. */
export function ReverseDcf({ inputs, price, currency }: ReverseProps) {
  const target = price.comparable ? price.value : null;
  const result = useMemo(() => {
    if (!inputs || target === null) return null;
    return { growth: impliedGrowth(inputs, target), margin: impliedMargin(inputs, target) };
  }, [inputs, target]);

  if (target === null) {
    return (
      <Panel title="Reverse DCF">
        <EmptyState title="No price to work back from" body={price.note ?? "A live price is needed to see what the market implies."} />
      </Panel>
    );
  }
  if (!inputs || !result) {
    return (
      <Panel title="Reverse DCF">
        <EmptyState title="Complete the model first" body="The reverse DCF holds your other inputs fixed, so they all need a value." />
      </Panel>
    );
  }
  const marginName = inputs.mode === "fcfMargin" ? "FCF margin" : "EBIT margin";
  const g = describe(result.growth, "growth", "growth rate", GROWTH_RANGE, currency);
  const m = describe(result.margin, "margin", marginName, MARGIN_RANGE, currency);
  const p = fmtPerShare(target, currency);
  return (
    <Panel title="Reverse DCF" action={<span className="text-[12px] text-faint">What the price implies</span>}>
      <div className="grid gap-3 px-4 py-4 sm:grid-cols-2">
        <Card
          title="Implied revenue growth"
          outcome={g}
          sentence={g.value === null ? null : `The market price of ${p} implies revenue growing ${fmtRate(g.value)} every year for ${inputs.years} years, with your margins, WACC and terminal growth unchanged.`}
        />
        <Card
          title={`Implied ${marginName}`}
          outcome={m}
          sentence={m.value === null ? null : `The market price of ${p} implies a steady ${marginName} of ${fmtRate(m.value)}, with your growth path, WACC and terminal growth unchanged.`}
        />
      </div>
      <div className="flex flex-wrap items-center gap-x-2 border-t border-line px-4 py-2.5 text-[11.5px] text-faint">
        <span>Solved in your browser against the price</span>
        {price.provenance && <SourceTag provenance={price.provenance} />}
      </div>
    </Panel>
  );
}
