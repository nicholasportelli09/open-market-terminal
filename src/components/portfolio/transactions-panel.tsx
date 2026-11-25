"use client";

import { useState } from "react";
import { portfolioStore } from "@/lib/client/portfolio-store";
import type { Portfolio, PortfolioValuation, Transaction, TransactionType } from "@/lib/portfolio";
import { Panel, Segmented } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/states";
import { TYPE_LABEL, readableMessage } from "./form-model";
import { fmtRate, fmtSignedMoney, toneClass } from "./money";
import { Note, btnDanger, btnSmall } from "./ui-bits";
import { cashEffect, describeTransaction, newestFirst, transactionNotes } from "./view-model";

type Filter = "all" | TransactionType;

type Props = { portfolio: Portfolio; valuation: PortfolioValuation; onEdit: (tx: Transaction) => void };

function Row({ tx, base, notes, onEdit }: { tx: Transaction; base: string; notes: { tone: "muted" | "error"; text: string }[]; onEdit: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const effect = cashEffect(tx);

  const remove = () => {
    const res = portfolioStore.remove(tx.id);
    if (!res.ok) {
      setError(`Not deleted: ${readableMessage(res.message)}`);
      setConfirming(false);
    }
  };

  return (
    <li className="px-4 py-3" data-testid="tx-row">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        <div className="w-[88px] shrink-0 pt-0.5 text-[12.5px] text-muted num">{tx.date}</div>
        <div className="min-w-0 flex-1 basis-[220px]">
          <div className="text-[13.5px] font-medium">{describeTransaction(tx)}</div>
          <div className="mt-0.5 flex flex-wrap gap-x-3 text-[12px] text-faint">
            {tx.type === "fx" ? null : <span className={`num ${toneClass(effect)}`}>{fmtSignedMoney(effect, tx.currency)} cash</span>}
            {tx.currency !== base && tx.fxToBase !== undefined && (
              <span className="num">
                FX {fmtRate(tx.fxToBase)} {base}/{tx.currency}
              </span>
            )}
            {tx.currency !== base && tx.fxToBase === undefined && tx.type !== "fx" && <span>No trade-date FX</span>}
            {tx.note && <span className="min-w-0 break-words">{tx.note}</span>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {confirming ? (
            <>
              <button type="button" className={btnDanger} onClick={remove}>
                Confirm delete
              </button>
              <button type="button" className={btnSmall} onClick={() => setConfirming(false)}>
                Cancel
              </button>
            </>
          ) : (
            <>
              <button type="button" className={btnSmall} onClick={onEdit} aria-label={`Edit ${describeTransaction(tx)} on ${tx.date}`}>
                Edit
              </button>
              <button type="button" className={btnSmall} onClick={() => { setError(null); setConfirming(true); }} aria-label={`Delete ${describeTransaction(tx)} on ${tx.date}`}>
                Delete
              </button>
            </>
          )}
        </div>
      </div>
      {(notes.length > 0 || error) && (
        <div className="mt-2 space-y-1.5 sm:ml-[104px]">
          {notes.map((n, i) => (
            <Note key={i} tone={n.tone}>
              {n.text}
            </Note>
          ))}
          {error && (
            <div role="alert">
              <Note tone="error">{error}</Note>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

/** Newest first, filterable by type. Engine notes (implicit funding, skipped rows) sit under their transaction. */
export function TransactionsPanel({ portfolio, valuation, onEdit }: Props) {
  const [filter, setFilter] = useState<Filter>("all");
  const present = new Set(portfolio.transactions.map((t) => t.type));
  const options = [{ id: "all" as Filter, label: `All (${portfolio.transactions.length})` }, ...(Object.keys(TYPE_LABEL) as TransactionType[]).filter((t) => present.has(t)).map((t) => ({ id: t as Filter, label: TYPE_LABEL[t] }))];
  const active = filter === "all" || present.has(filter) ? filter : "all";
  const rows = newestFirst(portfolio.transactions).filter((t) => active === "all" || t.type === active);
  const notes = transactionNotes(valuation);

  return (
    <Panel title="Transactions">
      {portfolio.transactions.length > 0 && (
        <div className="border-b border-line px-4 py-2.5">
          <Segmented options={options} value={active} onChange={setFilter} label="Filter by type" />
        </div>
      )}
      {rows.length === 0 ? (
        <EmptyState title="No transactions yet" body="Add a deposit, then the holdings you bought. Each one is checked before it is saved." />
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((t) => (
            <Row key={t.id} tx={t} base={portfolio.baseCurrency} notes={notes.get(t.id) ?? []} onEdit={() => onEdit(t)} />
          ))}
        </ul>
      )}
    </Panel>
  );
}
