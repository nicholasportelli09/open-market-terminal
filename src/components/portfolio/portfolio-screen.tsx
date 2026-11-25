"use client";

import { useState } from "react";
import { usePortfolioValuation } from "@/lib/client/use-portfolio";
import { todayIso, type Transaction, type TransactionType } from "@/lib/portfolio";
import { Panel } from "@/components/ui/panel";
import { LoadingBlock } from "@/components/ui/states";
import { AllocationPanel } from "./allocation-panel";
import { BackupPanel } from "./backup-panel";
import { CashTable } from "./cash-table";
import { emptyForm, formFromTransaction, type FormValues } from "./form-model";
import { HoldingsTable } from "./holdings-table";
import { IbkrPanel } from "./ibkr/ibkr-panel";
import { Onboarding } from "./onboarding";
import { SummaryPanel } from "./summary-panel";
import { TransactionForm } from "./transaction-form";
import { TransactionsPanel } from "./transactions-panel";
import { Note, btn, btnPrimary } from "./ui-bits";
import { useLiveReady } from "./use-live-ready";
import { valuationSources } from "./view-model";

type Editor = { initial: FormValues; editingId: string | null; key: number };

export function PortfolioScreen() {
  const state = usePortfolioValuation();
  const live = useLiveReady(state.quotes);
  const [editor, setEditor] = useState<Editor | null>(null);
  const { portfolio, valuation, returns, load, lastSave } = state;

  if (load.status === "loading") {
    return (
      <div className="space-y-5">
        <h1 className="text-[26px] font-semibold tracking-tight">Portfolio</h1>
        <div className="rounded-2xl border border-line bg-card">
          <LoadingBlock rows={4} />
        </div>
      </div>
    );
  }
  if (!portfolio || !valuation || !returns) return <Onboarding load={load} />;

  const base = portfolio.baseCurrency;
  const open = (type: TransactionType) => setEditor({ initial: emptyForm(type, base, todayIso()), editingId: null, key: Date.now() });
  const edit = (tx: Transaction) => setEditor({ initial: formFromTransaction(tx), editingId: tx.id, key: Date.now() });
  const hasTrades = portfolio.transactions.some((t) => t.type === "buy" || t.type === "sell");
  const delayed = new Set(valuation.positions.filter((p) => state.quotes[p.symbol]?.delayed).map((p) => p.symbol));
  const ready = live.ready || !hasTrades;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="break-words text-[26px] font-semibold tracking-tight">{portfolio.name}</h1>
          <p className="mt-0.5 text-[13px] text-muted">
            Base currency {base} · {portfolio.transactions.length} transaction{portfolio.transactions.length === 1 ? "" : "s"} · Stored in this browser, and synced to your account when signed in. Export to back up.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btnPrimary} onClick={() => open("buy")}>
            Add holding
          </button>
          <button type="button" className={btn} onClick={() => open("deposit")}>
            Add cash
          </button>
        </div>
      </div>

      {lastSave && !lastSave.ok && <Note tone="error">Last change was not saved: {lastSave.message}</Note>}
      {live.feedError && hasTrades && <Note tone="warn">The live quote feed is not responding; prices may be missing until it recovers.</Note>}

      <SummaryPanel valuation={valuation} returns={returns} ready={ready} sources={valuationSources(valuation, delayed)} />
      <HoldingsTable valuation={valuation} quotes={state.quotes} ready={ready} hasTrades={hasTrades} feedError={live.feedError} />
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="min-w-0">
          <CashTable valuation={valuation} />
        </div>
        <div className="min-w-0">{ready ? <AllocationPanel valuation={valuation} /> : <Panel title="Allocation"><LoadingBlock rows={4} /></Panel>}</div>
      </div>
      <TransactionsPanel portfolio={portfolio} valuation={valuation} onEdit={edit} />
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="min-w-0">
          <IbkrPanel />
        </div>
        <div className="min-w-0">
          <BackupPanel portfolio={portfolio} />
        </div>
      </div>

      {editor && <TransactionForm key={editor.key} portfolio={portfolio} initial={editor.initial} editingId={editor.editingId} onClose={() => setEditor(null)} />}
    </div>
  );
}
