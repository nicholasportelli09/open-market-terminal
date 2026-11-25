"use client";

import { useMemo } from "react";
import { fxSymbol, usdPerUnit } from "@/lib/client/fx-quotes";
import { useFeedStatus, useQuotes } from "@/lib/client/quote-store";
import { usePortfolioValuation } from "@/lib/client/use-portfolio";
import type { ExposureContext, PolicyRef } from "@/lib/macro/exposure";
import { implications, type Obs } from "@/lib/macro/implications";
import { buildInputs } from "@/lib/macro/inputs";
import { usdValueChange } from "@/lib/macro/live";
import { LIVE, POLICY_BY_CURRENCY } from "@/lib/macro/series";
import { quoteProvenance } from "@/lib/market-session";
import type { Quote } from "@/lib/types";
import { CentralBanks } from "./central-banks";
import { CurveSection } from "./curve-section";
import { ExposurePanel } from "./exposure-panel";
import { ImplicationsPanel } from "./implications-panel";
import { liveForChange } from "./live-card";
import { RiskSection } from "./risk-section";
import { GRID, GroupGate, Section, SeriesCards } from "./section";
import { useFredGroups, useLiveHistory, useSeriesMap, type History, type SeriesSlot } from "./use-macro-data";

const JUMPS = [
  { id: "central", label: "Central banks" },
  { id: "curve", label: "Yield curve" },
  { id: "real", label: "Real yields" },
  { id: "inflation", label: "Inflation and jobs" },
  { id: "credit", label: "Credit" },
  { id: "risk", label: "Risk and cross-asset" },
];

const TRACKED_CURRENCIES = ["EUR", "JPY"];

/** 1-year change in the USD value of each currency we have a live pair and daily history for. */
function usdValues(currencies: string[], quotes: Record<string, Quote | undefined>, histories: Record<string, History>, now: Date) {
  const out: Record<string, Obs | undefined> = {};
  for (const c of currencies) {
    const sym = fxSymbol(c);
    const q = sym ? quotes[sym] : undefined;
    const per = usdPerUnit(c, q);
    if (!sym || !q || q.last === null || per === null) continue;
    const series = liveForChange(q, histories[sym], now);
    const v = series ? usdValueChange(series.y1, series.latest.value, Math.abs(per - q.last) < 1e-12) : null;
    if (series && v !== null) out[c] = { value: v, asOf: series.latest.date };
  }
  return out;
}

function policyRefs(slots: Map<string, SeriesSlot>): Record<string, PolicyRef | undefined> {
  const out: Record<string, PolicyRef | undefined> = {};
  for (const [ccy, p] of Object.entries(POLICY_BY_CURRENCY)) {
    const r = slots.get(p.id)?.reading;
    if (r) out[ccy] = { label: p.label, value: r.latest.value, asOf: r.latest.date };
  }
  return out;
}

/** /macro: FRED macro series in six sections, live CNBC cross-asset prices, rule notes and portfolio exposure. */
export function MacroDashboard() {
  const groups = useFredGroups();
  const slots = useSeriesMap(groups);
  const pv = usePortfolioValuation();
  const { now } = pv;
  const currencies = useMemo(() => [...new Set([...TRACKED_CURRENCIES, ...pv.currencies])].filter((c) => c !== "USD").sort(), [pv.currencies]);
  const symbols = useMemo(
    () => [...new Set([...LIVE.map((l) => l.symbol), ...currencies.map(fxSymbol).filter((s): s is string => !!s)])],
    [currencies],
  );
  const quotes = useQuotes(symbols);
  const feed = useFeedStatus();
  const histories = useLiveHistory(symbols);

  const vixQuote = quotes[".VIX"];
  const vixLive = vixQuote && vixQuote.last !== null ? { value: vixQuote.last, asOf: quoteProvenance(vixQuote, now).asOf } : null;
  const inputs = buildInputs((id) => slots.get(id)?.reading, vixLive);
  const items = implications(inputs);
  const fredLoading = Object.values(groups).some((g) => g.data === null && g.status === "loading");
  const ctx: ExposureContext = {
    usdValue1y: usdValues(currencies, quotes, histories, now),
    dollar1y: inputs.dollar1y,
    policy: policyRefs(slots),
    vix: inputs.vix,
  };

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-[22px] font-semibold tracking-tight">Macro</h1>
        <p className="mt-1 max-w-[80ch] text-[13.5px] text-muted">
          Policy rates, the yield curve, inflation, credit and risk appetite.
        </p>
        <nav aria-label="Macro sections" className="mt-3 flex flex-wrap gap-1.5">
          {JUMPS.map((j) => (
            <a key={j.id} href={`#${j.id}-title`} className="rounded-lg border border-line px-2.5 py-1 text-[12.5px] text-muted transition-colors hover:bg-hover hover:text-fg">
              {j.label}
            </a>
          ))}
        </nav>
      </header>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <ImplicationsPanel items={items} loading={fredLoading || feed.status === "connecting"} />
        <ExposurePanel load={pv.load} valuation={pv.valuation} pricesLoaded={pv.pricesLoaded} ctx={ctx} />
      </div>

      <CentralBanks state={groups.central} slots={slots} />
      <CurveSection state={groups.curve} slots={slots} />

      <Section id="real" title="Real yields and inflation expectations" explainer="Yields after inflation, and the inflation bonds are pricing in.">
        <GroupGate state={groups.real} skeletons={5}>
          <div className={GRID}>
            <SeriesCards ids={["DFII5", "DFII10", "T5YIE", "T10YIE", "T5YIFR"]} slots={slots} />
          </div>
        </GroupGate>
      </Section>

      <Section id="inflation" title="Inflation and jobs" explainer="12-month price growth (the Fed targets 2% PCE), unemployment and job gains.">
        <GroupGate state={groups.labor} skeletons={5}>
          <div className={GRID}>
            <SeriesCards ids={["CPIAUCSL", "CPILFESL", "PCEPILFE", "UNRATE", "PAYEMS"]} slots={slots} />
          </div>
        </GroupGate>
      </Section>

      <Section id="credit" title="Credit" explainer="What companies pay over Treasuries to borrow, and overall financial conditions.">
        <GroupGate state={groups.credit} skeletons={3}>
          <div className={GRID}>
            <SeriesCards ids={["BAMLH0A0HYM2", "BAMLC0A0CM", "NFCI"]} slots={slots} />
          </div>
        </GroupGate>
      </Section>

      <RiskSection state={groups.risk} slots={slots} quotes={quotes} histories={histories} now={now} feedError={feed.status === "error"} />
    </div>
  );
}
