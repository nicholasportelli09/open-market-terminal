"use client";

import { useMemo, useState } from "react";
import type { FredRouteSeries } from "@/app/api/fred/route";
import type { CompanySnapshot } from "@/lib/company-types";
import type { ApiState } from "@/lib/client/use-api";
import { deleteModel, getSavedModel, saveModel, type SavedModel } from "@/lib/client/valuation-models";
import { quoteProvenance } from "@/lib/market-session";
import type { Provenance } from "@/lib/provenance";
import type { Quote } from "@/lib/types";
import { runDcf, runScenarios } from "@/lib/valuation";
import { CompanyInputs } from "./company-inputs";
import { CompsPanel } from "./comps-panel";
import { DiscountRate } from "./discount-rate";
import { ForecastTable } from "./forecast-table";
import { buildInputs, computeWacc, initialLabState, sourcedEquity, stateFromSaved, toScenarios, type LabCtx, type LabState, type Update } from "./lab-model";
import { LabToolbar } from "./lab-toolbar";
import { RevenueHistory } from "./revenue-history";
import { ReverseDcf } from "./reverse-dcf";
import { ScenariosPanel } from "./scenarios-panel";
import { parseBeta, seedFromSnapshot } from "./seed";
import { Sensitivity } from "./sensitivity";
import { Summary } from "./summary";

/** The price the lab compares fair value with, plus why it may be unusable. */
export type LivePrice = { value: number | null; provenance: Provenance | null; currency: string | null; comparable: boolean; note: string | null };

/**
 * Regular-session price only (as in the snapshot): `quote.last` outside market hours is the last close, so its
 * session is "closed" even while after-hours trading runs. Extended-hours prices are not used.
 */
function livePrice(snapshot: CompanySnapshot, quote: Quote | undefined, now: Date): LivePrice {
  const fromQuote = quote && quote.last !== null;
  const value = fromQuote ? quote.last : snapshot.price.value;
  let provenance: Provenance | null = null;
  if (fromQuote) {
    const p = quoteProvenance(quote, now);
    provenance = {
      ...p,
      session: p.session === "regular" ? "regular" : "closed",
      url: `https://www.cnbc.com/quotes/${encodeURIComponent(quote.symbol)}`,
    };
  } else if (snapshot.price.value !== null) provenance = snapshot.price.provenance;
  const currency = quote?.currency || snapshot.quoteCurrency;
  if (value === null) return { value, provenance, currency, comparable: false, note: "No live price from CNBC, so upside and the reverse DCF are unavailable." };
  if (snapshot.currencyMismatch || (currency && currency !== snapshot.currency)) {
    return { value, provenance, currency, comparable: false, note: `The price is in ${currency} but the filings are in ${snapshot.currency}; fair value is not compared with the price.` };
  }
  return { value, provenance, currency, comparable: true, note: null };
}

type WorkspaceProps = { snapshot: CompanySnapshot; quote: Quote | undefined; fred: ApiState<FredRouteSeries[]> };

export function Workspace({ snapshot, quote, fred }: WorkspaceProps) {
  const seed = useMemo(() => seedFromSnapshot(snapshot), [snapshot]);
  const [saved, setSaved] = useState<SavedModel | null>(() => getSavedModel(snapshot.symbol));
  const [state, setState] = useState<LabState>(() => (saved ? stateFromSaved(saved, seed) : initialLabState(seed)));
  const [notice, setNotice] = useState<string | null>(saved ? "Loaded your saved model." : null);
  const update: Update = (fn) => setState((s) => fn(s));

  const now = new Date();
  const series = fred.data?.find((r) => r.id === "DGS10")?.series ?? null;
  const riskFree = series ? { value: series.last.value / 100, provenance: { source: "fred", asOf: series.last.date, session: "n/a", url: series.url, note: "10-year Treasury yield (DGS10)" } as Provenance } : null;
  const betaValue = parseBeta(quote?.fundamentals.beta);
  const beta = betaValue === null || !quote ? null : { value: betaValue, provenance: { source: "cnbc", asOf: quoteProvenance(quote, now).asOf, url: `https://www.cnbc.com/quotes/${encodeURIComponent(quote.symbol)}`, note: "Beta, quote fundamentals" } as Provenance };
  const price = livePrice(snapshot, quote, now);
  const comparePrice = price.comparable ? price.value : null;

  const rfValue = riskFree?.value ?? null;
  const betaV = beta?.value ?? null;
  // A primitive, so the quote poll only re-runs the model when the equity value really depends on the price.
  const equityV = sourcedEquity(state, seed, comparePrice).value;
  // Memoised so the 3-second quote poll does not re-run the reverse DCF and sensitivity grid.
  const { waccB, built } = useMemo(() => {
    const w = computeWacc(state, seed, { riskFree: rfValue, beta: betaV, equity: equityV });
    return { waccB: w, built: buildInputs(state, seed, w.value) };
  }, [state, seed, rfValue, betaV, equityV]);
  const dcf = useMemo(() => (built.inputs ? runDcf(built.inputs) : null), [built]);
  const scenarioRun = useMemo(
    () => (built.inputs ? runScenarios(built.inputs, toScenarios(state.scenarios, state.mode), comparePrice) : null),
    [built, state.scenarios, state.mode, comparePrice],
  );
  const weighted = scenarioRun?.ok && scenarioRun.weighted.ok ? scenarioRun.weighted.value : null;

  const save = () => {
    if (!built.inputs) return;
    const runs = scenarioRun?.ok ? scenarioRun.scenarios : [];
    const valueOf = (id: string) => runs.find((r) => r.id === id)?.perShare ?? null;
    const model: SavedModel = {
      symbol: snapshot.symbol,
      updatedAt: new Date().toISOString(),
      inputs: built.inputs,
      scenarios: toScenarios(state.scenarios, state.mode),
      result: {
        perShare: dcf?.ok ? dcf.perShare : null,
        weighted,
        scenarioValues: { bear: valueOf("bear"), base: valueOf("base"), bull: valueOf("bull") },
        priceAtSave: comparePrice,
        currency: snapshot.currency,
      },
    };
    if (saveModel(model)) {
      setSaved(model);
      setNotice("Saved on this device.");
    } else {
      setNotice("Could not save: browser storage is unavailable or full.");
    }
  };
  const reset = () => {
    setState(initialLabState(seed));
    setNotice(saved ? "Reset to sourced inputs. Your saved model is kept until you save again." : "Reset to sourced inputs.");
  };
  const remove = () => {
    if (deleteModel(snapshot.symbol)) {
      setSaved(null);
      setNotice("Saved model deleted.");
    } else setNotice("Could not delete: browser storage is unavailable.");
  };

  const ctx: LabCtx = { state, update, seed, currency: snapshot.currency };
  return (
    <div className="space-y-5">
      <LabToolbar snapshot={snapshot} price={price} savedAt={saved?.updatedAt ?? null} notice={notice} canSave={!!dcf?.ok} onSave={save} onReset={reset} onDelete={remove} />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <aside className="min-w-0 lg:order-2">
          <div className="lg:sticky lg:top-[124px] xl:top-20">
            <Summary dcf={dcf} missing={built.missing} price={price} currency={snapshot.currency} wacc={waccB.value} terminalGrowth={state.terminalGrowth} scenarioWeighted={weighted} shares={built.inputs?.sharesDiluted ?? null} />
          </div>
        </aside>
        <div className="min-w-0 space-y-5 lg:order-1">
          <CompanyInputs {...ctx} snapshot={snapshot} />
          <RevenueHistory snapshot={snapshot} />
          <ForecastTable {...ctx} dcf={dcf} />
          <DiscountRate {...ctx} breakdown={waccB} riskFree={riskFree} beta={beta} fred={fred} quoteLoaded={!!quote} price={price} />
        </div>
      </div>
      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <ReverseDcf inputs={built.inputs} price={price} currency={snapshot.currency} />
        <Sensitivity inputs={built.inputs} price={comparePrice} currency={snapshot.currency} />
      </div>
      <ScenariosPanel {...ctx} run={scenarioRun} baseWacc={waccB.value} hasPrice={comparePrice !== null} />
      <CompsPanel snapshot={snapshot} price={price} />
    </div>
  );
}
