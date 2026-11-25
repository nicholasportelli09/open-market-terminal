"use client";

import { useState } from "react";
import type { CompanySnapshot } from "@/lib/company-types";
import { computeMultiple, impliedPrice, MULTIPLES, peerStats, upside, type CompanyMetrics } from "@/lib/valuation";
import { Panel } from "@/components/ui/panel";
import { SourceTags } from "@/components/ui/source-tag";
import { EmptyState } from "@/components/ui/states";
import { smallBtn } from "./field";
import { fmtMultiple, fmtPerShare, fmtSignedRate, toneClass } from "./fmt";
import { addPeer, COMP_MULTIPLES, MAX_PEERS, metricsFromSnapshot } from "./comps";
import { TickerPicker } from "./ticker-picker";
import { usePeers, type PeerState } from "./use-peers";
import type { LivePrice } from "./workspace";

type CompsProps = { snapshot: CompanySnapshot; price: LivePrice };

const td = "num px-2 py-1.5 text-right";
const sourcesTd = "px-4 py-1.5";
/** A fixed-width block (td min-width is ignored by auto table layout) so the source notes do not stretch every row. */
const sourcesBox = "w-[340px]";

function MultipleCells({ metrics }: { metrics: CompanyMetrics }) {
  return (
    <>
      {COMP_MULTIPLES.map((name) => {
        const r = computeMultiple(metrics, name);
        return (
          <td key={name} className={`${td} ${r.ok ? "" : "text-faint"}`}>
            {r.ok ? (
              fmtMultiple(r.value)
            ) : (
              // A tap target, not only a tooltip, so touch users can read why the multiple is not meaningful.
              <details className="ml-auto max-w-[150px]">
                <summary className="cursor-pointer list-none underline [&::-webkit-details-marker]:hidden decoration-dotted underline-offset-2" title={r.reason}>n/m</summary>
                <span className="mt-1 block whitespace-normal text-left font-sans text-[11px] leading-snug text-muted">{r.reason}</span>
              </details>
            )}
          </td>
        );
      })}
    </>
  );
}

function sourcesOf(s: CompanySnapshot) {
  const list = [s.price.provenance, s.metrics.revenueTTM.provenance].filter((p) => p.asOf);
  return list.map((p) => ({ ...p, note: p.source === "sec" ? p.note?.split(",")[0] : undefined }));
}

function PeerRow({ symbol, state, onRetry, onRemove }: { symbol: string; state: PeerState; onRetry: () => void; onRemove: () => void }) {
  const head = (
    <th scope="row" className="px-4 py-1.5 text-left">
      <span className="num font-semibold">{symbol}</span>
      {state.status === "ok" && <span className="block max-w-[180px] truncate text-[11.5px] font-normal text-faint">{state.data.name}</span>}
    </th>
  );
  if (state.status === "loading") {
    return (
      <tr className="border-t border-line">
        {head}
        <td colSpan={COMP_MULTIPLES.length + 2} className="px-2 py-2"><div className="skeleton h-4 w-full" /></td>
      </tr>
    );
  }
  if (state.status === "error") {
    return (
      <tr className="border-t border-line">
        {head}
        <td colSpan={COMP_MULTIPLES.length + 2} className="px-2 py-1.5 text-[12.5px] text-muted">
          {state.message}{" "}
          <button type="button" className={smallBtn} onClick={onRetry}>Try again</button>
          <button type="button" className={smallBtn} onClick={onRemove}>Remove</button>
        </td>
      </tr>
    );
  }
  const s = state.data;
  return (
    <tr className="border-t border-line">
      {head}
      <td className={td}>{s.price.value === null ? "—" : fmtPerShare(s.price.value, s.quoteCurrency ?? s.currency)}</td>
      <MultipleCells metrics={metricsFromSnapshot(s)} />
      <td className={sourcesTd}><SourceTags list={sourcesOf(s)} className={sourcesBox} /></td>
    </tr>
  );
}

/** Trading multiples of user-chosen peers, their median / mean, and the target price each median implies. */
export function CompsPanel({ snapshot, price }: CompsProps) {
  const [symbols, setSymbols] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { peers, retry } = usePeers(symbols);
  const live = price.comparable ? price.value : null;
  const target = metricsFromSnapshot(snapshot, live);
  const loaded = symbols.flatMap((s) => (peers[s]?.status === "ok" ? [metricsFromSnapshot((peers[s] as { data: CompanySnapshot }).data)] : []));
  const stats = COMP_MULTIPLES.map((name) => ({ name, stats: peerStats(loaded, name) }));
  const remove = (s: string) => setSymbols((list) => list.filter((x) => x !== s));
  const add = (raw: string) => {
    const r = addPeer(symbols, raw, snapshot.symbol);
    setError(r.error);
    setSymbols(r.peers);
  };

  return (
    <Panel title="Comparable companies" action={<span className="text-[12px] text-faint">{symbols.length} / {MAX_PEERS} peers</span>}>
      <div className="flex flex-wrap items-end gap-3 px-4 pt-4">
        <TickerPicker onPick={add} label="Add a peer" submitLabel="Add" placeholder="Peer ticker or name" className="max-w-[380px]" />
        {symbols.length > 0 && (
          <ul className="flex flex-wrap gap-1.5" aria-label="Peers">
            {symbols.map((s) => (
              <li key={s} className="inline-flex h-8 items-center gap-1 rounded-lg border border-line pl-2.5 text-[12.5px]">
                <span className="num font-medium">{s}</span>
                <button type="button" aria-label={`Remove ${s}`} onClick={() => remove(s)} className="flex h-full w-7 cursor-pointer items-center justify-center rounded-r-lg text-faint hover:bg-hover hover:text-fg">
                  <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden><path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {error && <p className="px-4 pt-1.5 text-[12.5px] text-down">{error}</p>}
      {symbols.length === 0 ? (
        <EmptyState title="No peers yet" body="Add the companies you consider comparable, for example MSFT and GOOGL when valuing a large tech company. The lab does not choose peers for you." />
      ) : (
        <>
          <div className="relative mt-4 overflow-x-auto border-t border-line">
            <table className="w-full min-w-[940px] text-[13px]">
              <caption className="sr-only">Peer multiples</caption>
              <thead className="text-[11.5px] text-faint">
                <tr>
                  <th scope="col" className="px-4 py-2 text-left font-medium">Company</th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">Price</th>
                  {COMP_MULTIPLES.map((n) => <th key={n} scope="col" className="px-2 py-2 text-right font-medium">{MULTIPLES[n].label}</th>)}
                  <th scope="col" className="px-4 py-2 text-left font-medium">Sources</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-line bg-surface/60">
                  <th scope="row" className="px-4 py-1.5 text-left">
                    <span className="num font-semibold">{snapshot.symbol}</span>
                    <span className="block text-[11.5px] font-normal text-faint">You are valuing</span>
                  </th>
                  <td className={td}>{live === null ? "—" : fmtPerShare(live, snapshot.currency)}</td>
                  <MultipleCells metrics={target} />
                  <td className={sourcesTd}><SourceTags list={[...(price.provenance ? [price.provenance] : []), ...sourcesOf(snapshot).slice(1)]} className={sourcesBox} /></td>
                </tr>
                {symbols.map((s) => <PeerRow key={s} symbol={s} state={peers[s]} onRetry={() => retry(s)} onRemove={() => remove(s)} />)}
                {(["median", "mean"] as const).map((k) => (
                  <tr key={k} className="border-t border-line font-medium">
                    <th scope="row" className="px-4 py-1.5 text-left text-[12.5px] capitalize text-muted">Peer {k}</th>
                    <td className={td} />
                    {stats.map(({ name, stats: st }) => <td key={name} className={td}>{st.ok ? fmtMultiple(st[k]) : "—"}</td>)}
                    <td className="px-4 py-1.5 text-[11.5px] font-normal text-faint">Model, from the peer rows</td>
                  </tr>
                ))}
                <tr className="border-t border-line">
                  <th scope="row" className="px-4 py-1.5 text-left text-[12.5px] font-medium">{snapshot.symbol} at peer median</th>
                  <td className={td} />
                  {stats.map(({ name, stats: st }) => {
                    const ip = st.ok ? impliedPrice(target, name, st.median) : null;
                    const up = ip?.ok && live !== null ? upside(ip.price, live) : null;
                    return (
                      <td key={name} className={td} title={ip && !ip.ok ? ip.reason : ip?.ok ? ip.warnings.join(" ") || undefined : undefined}>
                        {ip?.ok ? fmtPerShare(ip.price, snapshot.currency) : "—"}
                        {up !== null && <span className={`block text-[11.5px] ${toneClass(up)}`}>{fmtSignedRate(up)}</span>}
                      </td>
                    );
                  })}
                  <td className="px-4 py-1.5 text-[11.5px] text-faint">Target metric x peer median</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="space-y-1 border-t border-line px-4 py-3 text-[11.5px] text-faint">
            {stats.filter(({ stats: st }) => st.excluded > 0).map(({ name, stats: st }) => (
              <p key={name}>
                {MULTIPLES[name].label}: {st.excludedSymbols.join(", ")} left out (not meaningful: negative or missing earnings, cash flow or EV, or no comparable price).
              </p>
            ))}
            <p>TTM figures from SEC filings and CNBC prices; n/m = not meaningful (tap it for the reason). Medians use only meaningful values.</p>
          </div>
        </>
      )}
    </Panel>
  );
}
