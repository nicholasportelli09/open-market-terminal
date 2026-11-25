"use client";

import { useState } from "react";
import { portfolioStore } from "@/lib/client/portfolio-store";
import type { LoadStatus } from "@/lib/portfolio";
import { ImportControl } from "./backup-panel";
import { IbkrPanel } from "./ibkr/ibkr-panel";
import { BASE_CURRENCIES } from "./money";
import { Note, btnPrimary, inputCls } from "./ui-bits";

const CURRENCY_NAMES: Record<string, string> = {
  USD: "US dollar", EUR: "Euro", CHF: "Swiss franc", GBP: "British pound", JPY: "Japanese yen",
  CAD: "Canadian dollar", AUD: "Australian dollar", SEK: "Swedish krona", NOK: "Norwegian krone",
  DKK: "Danish krone", HKD: "Hong Kong dollar", SGD: "Singapore dollar", NZD: "New Zealand dollar",
};

function CreateForm() {
  const [name, setName] = useState("My portfolio");
  const [base, setBase] = useState("USD");
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Give the portfolio a name.");
      return;
    }
    const res = portfolioStore.create(name.trim(), base);
    if (!res.ok) setError(res.message);
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
        <label className="block space-y-1.5">
          <span className="text-[12.5px] font-medium text-muted">Portfolio name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} className={inputCls} aria-invalid={!!error && !name.trim()} />
        </label>
        <label className="block space-y-1.5">
          <span className="text-[12.5px] font-medium text-muted">Base currency</span>
          <select value={base} onChange={(e) => setBase(e.target.value)} className={inputCls}>
            {BASE_CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c} · {CURRENCY_NAMES[c]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="text-[12.5px] text-faint">
        Every total, return and allocation is shown in the base currency. Holdings in other currencies are converted with live CNBC rates.
      </p>
      {error && <Note tone="error">{error}</Note>}
      <button type="submit" className={btnPrimary}>
        Create portfolio
      </button>
    </form>
  );
}

const PROBLEM_TITLE: Record<string, string> = {
  corrupt: "The saved portfolio could not be read",
  newer_version: "Saved by a newer version of this app",
  unavailable: "Browser storage is not available",
};

/** Corrupt / newer-version / storage-blocked load states, each with what happened and what is safe. */
function LoadProblem({ load }: { load: Exclude<LoadStatus, { status: "ok" } | { status: "empty" }> }) {
  return (
    <Note tone={load.status === "unavailable" ? "error" : "warn"}>
      <p className="text-[13.5px] font-semibold">{PROBLEM_TITLE[load.status]}</p>
      {load.status === "corrupt" && (
        <>
          <ul className="mt-1 list-disc pl-4">
            {load.errors.slice(0, 5).map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
          <p className="mt-1.5">
            {load.backupKey ? (
              <>
                The unreadable data was copied to browser storage key <code className="rounded bg-hover px-1 font-mono text-[11.5px]">{load.backupKey}</code> and the main slot was cleared, so you can start again or import a backup below.
              </>
            ) : (
              "A backup copy could not be written, so the data was left in place."
            )}
          </p>
        </>
      )}
      {load.status === "newer_version" && (
        <p className="mt-1">
          {load.message}. It is kept exactly as it is and this version will not overwrite it. Open the app version that saved it, or reload after the update reaches this device.
        </p>
      )}
      {load.status === "unavailable" && (
        <p className="mt-1">
          {load.message}. The portfolio is stored only in this browser, so it needs site storage (it is blocked in some private windows). Allow storage for this site and reload.
        </p>
      )}
    </Note>
  );
}

export function Onboarding({ load }: { load: LoadStatus }) {
  const problem = load.status === "corrupt" || load.status === "newer_version" || load.status === "unavailable" ? load : null;
  const canCreate = !problem || problem.status === "corrupt";
  return (
    <div className="mx-auto max-w-[760px] space-y-5">
      <div>
        <h1 className="text-[26px] font-semibold tracking-tight">Portfolio</h1>
        <p className="mt-1 text-[14px] text-muted">
          Track holdings, cash, income and returns from your own transactions, valued with live prices. Stored in this browser, and synced to your account when signed in. Export to back up.
        </p>
      </div>
      {problem && <LoadProblem load={problem} />}
      {canCreate && <IbkrPanel variant="onboarding" />}
      {canCreate && (
        <section className="rounded-2xl border border-line bg-card p-5" aria-labelledby="create-heading">
          <h2 id="create-heading" className="mb-4 text-[15px] font-semibold">Or start one by hand</h2>
          <CreateForm />
        </section>
      )}
      {canCreate && (
        <section className="rounded-2xl border border-line bg-card p-5" aria-labelledby="import-heading">
          <h2 id="import-heading" className="text-[15px] font-semibold">Or restore a backup</h2>
          <p className="mb-3 mt-1 text-[13px] text-muted">Import a JSON file exported from this terminal. It is checked before anything is saved.</p>
          <ImportControl current={null} />
        </section>
      )}
    </div>
  );
}
