"use client";

import Link from "next/link";
import type { PortfolioValuation, PositionValuation } from "@/lib/portfolio";
import type { Quote } from "@/lib/types";
import { fmtAsOf } from "@/lib/format";
import { quoteHref } from "@/lib/instruments";
import { Panel } from "@/components/ui/panel";
import { Chip, SessionMark, SourceTags } from "@/components/ui/source-tag";
import { EmptyState, LoadingBlock } from "@/components/ui/states";
import { fmtMoney, fmtQty, fmtReturn, fmtShare, fmtSignedMoney, sortRows, toneClass } from "./money";
import { SortHeader, useSort } from "./sort-header";
import { Note, PartialChip } from "./ui-bits";
import { valuationSources } from "./view-model";

type Key = "symbol" | "quantity" | "avgCost" | "price" | "valueLocal" | "valueBase" | "unrealized" | "unrealizedPct" | "priceEffect" | "fxEffect" | "day" | "weight";

const KEY: Record<Key, (p: PositionValuation) => number | string | null | undefined> = {
  symbol: (p) => p.symbol,
  quantity: (p) => p.quantity,
  avgCost: (p) => p.avgCost,
  price: (p) => p.price.price,
  valueLocal: (p) => p.marketValueLocal,
  valueBase: (p) => p.marketValueBase,
  unrealized: (p) => p.unrealizedBase,
  unrealizedPct: (p) => p.unrealizedPct,
  priceEffect: (p) => p.priceEffectBase,
  fxEffect: (p) => p.fxEffectBase,
  day: (p) => p.dayChange?.changeBase,
  weight: (p) => p.weight,
};

type Props = { valuation: PortfolioValuation; quotes: Record<string, Quote | undefined>; ready: boolean; hasTrades: boolean; feedError: boolean };

const td = "whitespace-nowrap px-3 py-2.5 text-right num";

export function HoldingsTable({ valuation: v, quotes, ready, hasTrades, feedError }: Props) {
  const { sort, toggle } = useSort<Key>({ key: "valueBase", dir: "desc" }, ["symbol"]);
  const base = v.baseCurrency;
  const delayed = new Set(v.positions.filter((p) => quotes[p.symbol]?.delayed).map((p) => p.symbol));
  const rows = sortRows(v.positions, KEY[sort.key], sort.dir);
  const missing = v.missing.prices;
  const h = (label: string, k: Key, title?: string) => <SortHeader label={label} k={k} sort={sort} onSort={toggle} title={title} />;

  if (!ready && hasTrades) {
    return (
      <Panel title="Holdings">
        <LoadingBlock rows={4} />
      </Panel>
    );
  }
  if (v.positions.length === 0 && missing.length === 0) {
    return (
      <Panel title="Holdings">
        <EmptyState title="No open holdings" body={hasTrades ? "Every position has been sold." : "Use Add holding to record a buy."} />
      </Panel>
    );
  }

  return (
    <Panel title="Holdings" action={!v.totals.complete && missing.length > 0 ? <PartialChip title={`No price for ${missing.join(", ")}`} /> : undefined}>
      {v.positions.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] text-[13px]">
            <thead className="border-b border-line text-[11px] text-faint">
              <tr>
                <SortHeader label="Symbol" k="symbol" sort={sort} onSort={toggle} align="left" />
                {h("Qty", "quantity")}
                {h("Avg cost", "avgCost", "Per unit, local currency, fees included")}
                {h("Last", "price")}
                {h("Value", "valueLocal", "Market value, local currency")}
                {h(`Value ${base}`, "valueBase")}
                {h("Unrealized", "unrealized", `Unrealized P&L in ${base}`)}
                {h("%", "unrealizedPct")}
                {h("Price eff.", "priceEffect", "Price move at each lot's trade-date FX")}
                {h("FX eff.", "fxEffect", "Currency move on the current value")}
                {h("Day", "day", "Since the previous close, at current FX")}
                {h("Weight", "weight")}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((p) => (
                <tr key={p.symbol} className="hover:bg-hover/60">
                  <td className="max-w-[200px] px-3 py-2.5 text-left">
                    <Link href={quoteHref(p.symbol)} className="font-semibold hover:underline">
                      {p.symbol}
                    </Link>
                    {p.name && <div className="truncate text-[11.5px] text-faint">{p.name}</div>}
                  </td>
                  <td className={td}>{fmtQty(p.quantity)}</td>
                  <td className={td}>{fmtMoney(p.avgCost, p.currency)}</td>
                  <td className={td}>
                    <div>{fmtMoney(p.price.price, p.currency)}</div>
                    <div className="mt-0.5 flex items-center justify-end gap-1.5 font-sans">
                      <span className="text-[11px] text-faint">{fmtAsOf(p.price.asOf)}</span>
                      {p.price.session && <SessionMark session={p.price.session} />}
                      {delayed.has(p.symbol) && <Chip title="CNBC marks this quote as delayed">Delayed</Chip>}
                    </div>
                  </td>
                  <td className={td}>{fmtMoney(p.marketValueLocal, p.currency)}</td>
                  <td className={td}>{fmtMoney(p.marketValueBase, base)}</td>
                  <td className={`${td} ${toneClass(p.unrealizedBase)}`}>
                    {fmtSignedMoney(p.unrealizedBase, base)}
                    {p.costAtCurrentFx && <div className="font-sans text-[11px] text-accent" title="No trade-date FX was entered for at least one lot">cost at today&apos;s FX</div>}
                  </td>
                  <td className={`${td} ${toneClass(p.unrealizedPct)}`}>{fmtReturn(p.unrealizedPct)}</td>
                  <td className={`${td} ${toneClass(p.priceEffectBase)}`}>{fmtSignedMoney(p.priceEffectBase, base)}</td>
                  <td className={`${td} ${toneClass(p.fxEffectBase)}`}>{p.currency === base ? "—" : fmtSignedMoney(p.fxEffectBase, base)}</td>
                  <td className={`${td} ${toneClass(p.dayChange?.changeBase)}`}>
                    {p.dayChange ? (
                      <>
                        {fmtSignedMoney(p.dayChange.changeBase, base)}
                        <div className="text-[11px]">{fmtReturn(p.dayChange.changePct)}</div>
                      </>
                    ) : (
                      <span className="text-faint" title="No previous close from CNBC">—</span>
                    )}
                  </td>
                  <td className={td}>{fmtShare(p.weight)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {missing.length > 0 && (
        <div className="border-t border-line px-4 py-3">
          <Note tone="warn">
            {feedError ? "The quote feed is failing. " : ""}No usable live price for {missing.join(", ")}, so {missing.length === 1 ? "it is" : "they are"} left out of every total instead of being valued at cost.
          </Note>
        </div>
      )}
      <footer className="border-t border-line px-4 py-2.5">
        <SourceTags list={valuationSources(v, delayed)} />
      </footer>
    </Panel>
  );
}
