import Link from "next/link";
import { SourceTag } from "@/components/ui/source-tag";
import { fmtNumber } from "@/lib/format";
import { fmtFraction, fmtMoney } from "@/lib/scanner/labels";
import type { ScenarioOutcome, ThesisResult } from "@/lib/scanner/thesis";

const path = (xs: number[]) => xs.map((x) => fmtNumber(x * 100, 1)).join("  ");

type Line = { label: string; cell: (s: ScenarioOutcome) => string; strong?: boolean; wrap?: boolean };

const LINES: Line[] = [
  { label: "Growth % yr 1-5", cell: (s) => path(s.assumptions.revenueGrowth), wrap: true },
  { label: "FCF margin % yr 1-5", cell: (s) => path(s.assumptions.fcfMargin), wrap: true },
  { label: "Terminal growth", cell: (s) => fmtFraction(s.assumptions.terminalGrowth) },
  { label: "WACC", cell: (s) => fmtFraction(s.assumptions.wacc) },
  { label: "Fair value / share", cell: (s) => fmtNumber(s.perShare, 2), strong: true },
  { label: "Return vs price", cell: (s) => (s.returnPotential === null ? "—" : `${s.returnPotential >= 0 ? "+" : "−"}${fmtFraction(Math.abs(s.returnPotential))}`) },
  { label: "Margin of safety", cell: (s) => fmtFraction(s.marginOfSafety) },
  { label: "Terminal % of EV", cell: (s) => fmtFraction(s.terminalShareOfEv, 0) },
];

/** Bear/base/bull: the AI's assumptions, and the fair values this app computed from them with its DCF. */
export function ScenarioTable({ thesis }: { thesis: ThesisResult }) {
  const { scenarios, dcfBase, price } = thesis;
  return (
    <section aria-labelledby="sc-title" className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 id="sc-title" className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">Scenarios (5-year FCF-margin DCF)</h4>
        <Link href={`/valuation?symbol=${encodeURIComponent(thesis.symbol)}`} className="text-[12.5px] font-medium text-muted underline-offset-2 hover:text-fg hover:underline">
          Open in Valuation Lab
        </Link>
      </div>
      {!scenarios ? (
        <p className="text-[12.5px] text-muted">{thesis.scenariosNote ?? "No scenarios."}</p>
      ) : (
        <>
          <p className="text-[11.5px] leading-snug text-faint">
            The AI proposed the assumptions only. Fair values are computed by this terminal&apos;s DCF from TTM revenue, net debt and share
            count in the filings. They are model outputs that depend entirely on the assumptions, not predictions.
          </p>
          <div className="relative max-w-full overflow-x-auto rounded-xl border border-line">
            <table className="w-full min-w-[440px] text-[12.5px]">
              <thead className="border-b border-line text-[11.5px] uppercase tracking-[0.04em] text-muted">
                <tr>
                  <th scope="col" className="px-3 py-2 text-left font-medium"><span className="sr-only">Line</span></th>
                  {scenarios.map((s) => (
                    <th key={s.id} scope="col" className="px-3 py-2 text-right font-medium">{s.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {LINES.map((l) => (
                  <tr key={l.label} className="border-b border-line last:border-0">
                    <th scope="row" className="whitespace-nowrap px-3 py-1.5 text-left font-normal text-muted">{l.label}</th>
                    {scenarios.map((s) => (
                      <td key={s.id} className={`num px-3 py-1.5 text-right ${l.wrap ? "whitespace-pre-wrap text-[11.5px]" : "whitespace-nowrap"} ${l.strong ? "font-semibold" : ""}`}>{l.cell(s)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="space-y-1.5">
            {scenarios.map((s) => (
              <li key={s.id} className="text-[12.5px] leading-snug">
                <span className="font-medium">{s.label}:</span> <span className="text-muted">{s.assumptions.rationale}</span>
                {s.assumptions.evidence.length > 0 && <span className="num text-faint"> [{s.assumptions.evidence.join(", ")}]</span>}
                {[...s.errors, ...s.warnings].map((w) => (
                  <span key={w} className="block text-[11.5px] text-faint">{w}</span>
                ))}
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="space-y-0.5 border-t border-line pt-2 text-[11.5px] text-faint">
        {price && (
          <p>
            Price {fmtNumber(price.value, 2)} {price.currency} · <SourceTag provenance={price.provenance} />
          </p>
        )}
        {dcfBase && (
          <>
            <p>Revenue TTM {fmtMoney(dcfBase.revenueTTM, dcfBase.currency)} · <SourceTag provenance={dcfBase.provenance.revenueTTM} /></p>
            <p>Net debt {fmtMoney(dcfBase.netDebt, dcfBase.currency)} · <SourceTag provenance={dcfBase.provenance.netDebt} /></p>
            <p>Shares {fmtNumber(dcfBase.shares / 1e9, 3)}B · <SourceTag provenance={dcfBase.provenance.shares} /></p>
          </>
        )}
      </div>
    </section>
  );
}
