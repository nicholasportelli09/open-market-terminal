"use client";

import { useId, useState } from "react";
import { portfolioStore } from "@/lib/client/portfolio-store";
import { decodePortfolio, todayIso, type Portfolio } from "@/lib/portfolio";
import { Panel } from "@/components/ui/panel";
import { Note, btn, btnDanger, btnSmall } from "./ui-bits";

const MAX_FILE_BYTES = 5_000_000;

type Pending = { text: string; incoming: Portfolio };

function fileName(p: Portfolio): string {
  const slug = p.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "portfolio";
  return `${slug}-${todayIso()}.json`;
}

/** Downloads the saved portfolio as a JSON file. */
export function exportPortfolio(p: Portfolio): string | null {
  const json = portfolioStore.exportJson();
  if (!json) return "Nothing to export yet.";
  try {
    const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName(p);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : "Could not create the download.";
  }
}

/** File input, parse + validation errors, then an explicit confirm before anything is replaced. */
export function ImportControl({ current }: { current: Portfolio | null }) {
  const inputId = useId();
  const [errors, setErrors] = useState<string[]>([]);
  const [pending, setPending] = useState<Pending | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const onFile = async (file: File | undefined) => {
    setErrors([]);
    setDone(null);
    setPending(null);
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setErrors(["File is larger than 5 MB; this is not a portfolio export."]);
      return;
    }
    const text = await file.text().catch(() => null);
    if (text === null) {
      setErrors(["Could not read the file."]);
      return;
    }
    const decoded = decodePortfolio(text);
    if (!decoded.ok) setErrors(decoded.errors);
    else setPending({ text, incoming: decoded.portfolio });
  };

  const confirm = () => {
    if (!pending) return;
    const res = portfolioStore.importJson(pending.text);
    if (res.ok) {
      setDone(`Imported "${pending.incoming.name}" with ${pending.incoming.transactions.length} transactions.`);
      setPending(null);
    } else setErrors(res.errors);
  };

  return (
    <div className="space-y-2.5">
      <div>
        <input
          id={inputId}
          type="file"
          accept="application/json,.json"
          className="peer sr-only"
          onChange={(e) => {
            void onFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <label htmlFor={inputId} className={`${btn} peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-[var(--focus)]`}>
          Import JSON
        </label>
      </div>
      {errors.length > 0 && (
        <Note tone="error">
          <p className="font-semibold">This file cannot be imported. Nothing was changed.</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {errors.slice(0, 8).map((e, i) => (
              <li key={i}>{e}</li>
            ))}
            {errors.length > 8 && <li>and {errors.length - 8} more</li>}
          </ul>
        </Note>
      )}
      {pending && (
        <Note tone="warn">
          <p>
            {current
              ? `Replace "${current.name}" (${current.transactions.length} transactions) with "${pending.incoming.name}" (${pending.incoming.transactions.length} transactions, base ${pending.incoming.baseCurrency})? The current portfolio is overwritten; export it first if you need it.`
              : `Open "${pending.incoming.name}" (${pending.incoming.transactions.length} transactions, base ${pending.incoming.baseCurrency})?`}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" onClick={confirm} className={current ? btnDanger : btnSmall}>
              {current ? "Confirm replace" : "Confirm import"}
            </button>
            <button type="button" onClick={() => setPending(null)} className={btnSmall}>
              Cancel
            </button>
          </div>
        </Note>
      )}
      {done && <p className="text-[12.5px] text-up" role="status">{done}</p>}
    </div>
  );
}

export function BackupPanel({ portfolio }: { portfolio: Portfolio }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <Panel title="Backup" bodyClassName="space-y-3 px-4 py-4">
      <p className="text-[13px] text-muted">Stored in this browser, and synced to your account when signed in. Export to back up.</p>
      <div className="flex flex-wrap items-start gap-2">
        <button type="button" className={btn} onClick={() => setError(exportPortfolio(portfolio))}>
          Export JSON
        </button>
        <ImportControl current={portfolio} />
      </div>
      {error && <Note tone="error">{error}</Note>}
    </Panel>
  );
}
