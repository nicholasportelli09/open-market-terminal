"use client";

import { marginOfSafety, TERMINAL_SHARE_WARNING, upside, type DcfResult } from "@/lib/valuation";
import { fmtCompact } from "@/lib/format";
import { Panel } from "@/components/ui/panel";
import { SourceTag } from "@/components/ui/source-tag";
import { friendlyErrors } from "./errors";
import { fmtMoney, fmtPerShare, fmtRate, fmtSignedRate, toneClass } from "./fmt";
import type { LivePrice } from "./workspace";

type SummaryProps = {
  dcf: DcfResult | null;
  missing: string[];
  price: LivePrice;
  currency: string;
  wacc: number | null;
  terminalGrowth: number;
  scenarioWeighted: number | null;
  shares: number | null;
};

function BridgeRow({ label, value, strong, sign }: { label: string; value: string; strong?: boolean; sign?: string }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 py-1 ${strong ? "border-t border-line pt-1.5 font-medium" : ""}`}>
      <span className="text-[12.5px] text-muted">
        {sign && <span className="num mr-1.5 inline-block w-3 text-faint">{sign}</span>}
        {label}
      </span>
      <span className="num text-[13px]">{value}</span>
    </div>
  );
}

/** Fair value per share, the EV to equity bridge and the comparison with the live price. */
export function Summary({ dcf, missing, price, currency, wacc, terminalGrowth, scenarioWeighted, shares }: SummaryProps) {
  if (missing.length > 0 || !dcf) {
    return (
      <Panel title="Fair value">
        <div className="px-4 py-6">
          <p className="text-[13.5px] font-medium">Not enough inputs yet</p>
          <p className="mt-1 text-[13px] text-muted">To compute a fair value, enter: {missing.join(", ")}.</p>
        </div>
      </Panel>
    );
  }
  if (!dcf.ok) {
    return (
      <Panel title="Fair value">
        <div className="px-4 py-5">
          <p className="text-[13.5px] font-medium text-down">These inputs cannot be valued</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-[13px] text-muted">
            {friendlyErrors(dcf.errors).map((e) => <li key={e}>{e}</li>)}
          </ul>
        </div>
      </Panel>
    );
  }
  const p = price.comparable ? price.value : null;
  const up = p === null ? null : upside(dcf.perShare, p);
  const mos = p === null ? null : marginOfSafety(dcf.perShare, p);
  const tvShare = dcf.terminalShareOfEv;
  const otherWarnings = dcf.warnings.filter((w) => !w.startsWith("Terminal value is"));
  return (
    <Panel title="Fair value" action={<span className="text-[12px] text-faint">Your model</span>}>
      <div className="px-4 pt-4">
        <p className="text-[12px] text-muted">DCF value per share</p>
        <p className={`num mt-0.5 text-[34px] font-semibold leading-none tracking-tight ${dcf.perShare < 0 ? "text-down" : ""}`}>{fmtPerShare(dcf.perShare, currency)}</p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-surface px-3 py-2">
            <p className="text-[11.5px] text-muted">Upside vs price</p>
            <p className={`num text-[17px] font-semibold ${toneClass(up)}`}>{fmtSignedRate(up)}</p>
          </div>
          <div className="rounded-xl bg-surface px-3 py-2">
            <p className="text-[11.5px] text-muted">Margin of safety</p>
            <p className={`num text-[17px] font-semibold ${toneClass(mos)}`}>{mos === null ? "—" : fmtRate(mos)}</p>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-2 text-[12px] text-muted">
          <span>Price {p === null ? "unavailable" : fmtPerShare(p, currency)}</span>
          {price.provenance && <SourceTag provenance={price.provenance} />}
        </div>
        {price.note && <p className="mt-1 text-[12px] text-muted">{price.note}</p>}
        {mos !== null && mos < 0 && <p className="mt-1 text-[12px] text-muted">The price is above this fair value, so there is no margin of safety.</p>}
        {scenarioWeighted !== null && (
          <p className="mt-2 text-[12.5px] text-muted">
            Probability-weighted scenarios: <span className="num font-medium text-fg">{fmtPerShare(scenarioWeighted, currency)}</span>
          </p>
        )}
      </div>
      <div className="mt-4 border-t border-line px-4 py-3">
        <p className="mb-1 text-[11.5px] font-medium uppercase tracking-[0.06em] text-faint">Enterprise value to equity</p>
        <BridgeRow label="PV of forecast cash flows" value={fmtMoney(dcf.sumPv, currency)} />
        <BridgeRow sign="+" label="PV of terminal value" value={fmtMoney(dcf.pvTerminal, currency)} />
        <BridgeRow strong label="Enterprise value" value={fmtMoney(dcf.enterpriseValue, currency)} />
        <BridgeRow sign="−" label="Net debt" value={fmtMoney(dcf.enterpriseValue - dcf.equityValue, currency)} />
        <BridgeRow strong label="Equity value" value={fmtMoney(dcf.equityValue, currency)} />
        <BridgeRow sign="÷" label="Shares" value={shares === null ? "—" : fmtCompact(shares)} />
      </div>
      <div className="space-y-1.5 border-t border-line px-4 py-3 text-[12px]">
        <p className="flex justify-between gap-3 text-muted">
          <span>Terminal value share of EV</span>
          <span className={`num ${tvShare !== null && tvShare > TERMINAL_SHARE_WARNING ? "text-accent" : ""}`}>{tvShare === null ? "—" : fmtRate(tvShare, 0)}</span>
        </p>
        {tvShare !== null && tvShare > TERMINAL_SHARE_WARNING && (
          <p className="text-accent">Most of this value comes after year {dcf.rows.length}: the result rests on the terminal growth ({fmtRate(terminalGrowth, 2)}) and WACC ({fmtRate(wacc, 2)}).</p>
        )}
        {otherWarnings.map((w) => <p key={w} className="text-down">{w}</p>)}
        <p className="text-faint">Computed in your browser from the inputs on this page. Not investment advice.</p>
      </div>
    </Panel>
  );
}
