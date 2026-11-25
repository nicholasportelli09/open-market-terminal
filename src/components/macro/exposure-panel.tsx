import Link from "next/link";
import type { ReactNode } from "react";
import { fmtAsOf, fmtNumber, fmtPct } from "@/lib/format";
import { summarizeExposure, type ExposureContext, type ExposureSummary } from "@/lib/macro/exposure";
import type { PortfolioValuation } from "@/lib/portfolio";
import { Panel } from "@/components/ui/panel";
import { SourceTags } from "@/components/ui/source-tag";
import { EmptyState, LoadingBlock } from "@/components/ui/states";

type LoadState = { status: string; message?: string };

type Props = { load: LoadState; valuation: PortfolioValuation | null; pricesLoaded: boolean; ctx: ExposureContext };

/**
 * Oldest observation time among the CNBC prices and FX rates actually used in the valuation
 * (positions and cash). Null when none were used, e.g. a base-currency cash-only portfolio.
 */
function cnbcAsOf(v: PortfolioValuation): string | null {
  const inputs = [...v.positions.flatMap((p) => [p.price, p.fx]), ...v.cash.map((c) => c.fx)];
  const stamps = inputs.filter((i) => i !== null && i.source === "cnbc" && !!i.asOf).map((i) => i!.asOf);
  return [...stamps].sort((a, b) => Date.parse(a) - Date.parse(b))[0] ?? null;
}

const linkBtn =
  "mt-2 inline-flex h-8 items-center rounded-lg border border-line px-3 text-[12.5px] font-medium text-muted transition-colors hover:bg-hover hover:text-fg";

const pct0 = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);

function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[11.5px] text-faint">{label}</p>
      <p className="num truncate text-[17px] font-medium">{value}</p>
      {sub && <p className="text-[12px] leading-snug text-muted">{sub}</p>}
    </div>
  );
}

function Summary({ s, pricesAsOf }: { s: ExposureSummary; pricesAsOf: string | null }) {
  return (
    <div className="space-y-4 px-4 py-4">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label={`Total value (${s.base})`} value={fmtNumber(s.totalValueBase, 2)} sub={s.complete ? "All holdings priced" : "Partial: see below"} />
        <Stat label="Invested" value={pct0(s.investedPct)} />
        <Stat label="Cash" value={pct0(s.cashPct)} sub={s.cashRate ? `${s.cashRate.label} ${s.cashRate.value.toFixed(2)}%` : undefined} />
        <Stat label="Largest position" value={s.largest ? s.largest.symbol : "—"} sub={s.largest ? `${pct0(s.largest.weight)} of total` : "No positions"} />
      </div>
      {s.currencies.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-left text-[12.5px]">
            <thead className="text-[11.5px] text-faint">
              <tr>
                <th className="py-1 pr-3 font-medium">Currency</th>
                <th className="py-1 pr-3 text-right font-medium">Share</th>
                <th className="py-1 pr-3 text-right font-medium">Value ({s.base})</th>
                <th className="py-1 text-right font-medium">1y vs {s.base}</th>
              </tr>
            </thead>
            <tbody>
              {s.currencies.map((c) => (
                <tr key={c.currency} className="border-t border-line">
                  <td className="py-1 pr-3 font-medium">{c.currency}</td>
                  <td className="num py-1 pr-3 text-right">{pct0(c.pct)}</td>
                  <td className="num py-1 pr-3 text-right">{fmtNumber(c.valueBase, 2)}</td>
                  <td className="num py-1 text-right" title={c.vsBase1y?.asOf ? `As of ${fmtAsOf(c.vsBase1y.asOf)}` : undefined}>
                    {c.currency === s.base ? "Base" : c.vsBase1y ? fmtPct(c.vsBase1y.value, 1) : "Not tracked"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {s.notes.length > 0 && (
        <ul className="space-y-1.5 text-[13px] leading-snug text-muted">
          {s.notes.map((n) => (
            <li key={n} className="flex gap-2">
              <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-faint" aria-hidden />
              <span>{n}</span>
            </li>
          ))}
        </ul>
      )}
      {!s.complete && s.missing.length > 0 && (
        <p className="text-[12px] text-faint">Not valued (no live price or rate): {s.missing.join(", ")}. Shares above cover only what could be valued.</p>
      )}
      <SourceTags
        list={[
          { source: "user", asOf: "", note: "your transactions, stored on this device" },
          ...(pricesAsOf ? [{ source: "cnbc" as const, asOf: pricesAsOf, note: "prices and FX (oldest quote used); 1y currency moves from daily closes" }] : []),
        ]}
      />
    </div>
  );
}

/** Currency, cash and concentration exposure of the saved portfolio, paired with macro readings. */
export function ExposurePanel({ load, valuation, pricesLoaded, ctx }: Props) {
  const action = (
    <Link href="/portfolio" className="text-[12.5px] font-medium text-muted underline-offset-2 hover:text-fg hover:underline">
      Open portfolio
    </Link>
  );
  let body: ReactNode;
  if (load.status === "loading") body = <LoadingBlock rows={3} />;
  else if (load.status !== "ok" && load.status !== "empty") {
    body = <EmptyState title="Portfolio could not be read" body={load.message ?? "Open the portfolio page to see what happened and fix it."} action={<Link href="/portfolio" className={linkBtn}>Go to portfolio</Link>} />;
  } else {
    const summary = valuation ? summarizeExposure(valuation, ctx) : null;
    const pricesAsOf = valuation ? cnbcAsOf(valuation) : null;
    if (summary) body = <Summary s={summary} pricesAsOf={pricesAsOf} />;
    else if (valuation && valuation.positions.length + valuation.cash.length > 0 && !pricesLoaded) body = <LoadingBlock rows={3} />;
    else {
      body = (
        <EmptyState
          title="No portfolio yet"
          body="Add holdings to see your currency exposure and largest position here."
          action={<Link href="/portfolio" className={linkBtn}>Set up portfolio</Link>}
        />
      );
    }
  }
  return (
    <Panel title="Your portfolio exposure" action={action}>
      {body}
    </Panel>
  );
}
