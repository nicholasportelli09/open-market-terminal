"use client";

import { type FormEvent, useId, useState } from "react";
import { btn, btnPrimary, inputCls } from "../ui-bits";

const STEPS: { text: string; link?: { href: string; label: string } }[] = [
  { text: "Log in to IBKR and open Performance & Reports, then Flex Queries.", link: { href: "https://portal.interactivebrokers.com/", label: "Open IBKR" } },
  { text: "Next to Activity Flex Query, click + and name it Terminal." },
  { text: "Tick Open Positions, Cash Report and Account Information. In each, click Select All, then Save." },
  { text: "Set Format to XML and Period to Last Business Day. Click Continue, then Create." },
  { text: "Copy the Query ID: the number next to Terminal in the list." },
  { text: "Click the gear next to Flex Web Service Configuration, turn it on, click Generate New Token (longest expiry, no IP restriction) and copy the token." },
];

type Props = { busy: boolean; onConnect: (token: string, queryId: string) => void; onFile: (file: File | undefined) => void };

/** Two-minute IBKR setup: exact clicks, then the token and Query ID; an XML file upload as the no-token option. */
export function IbkrSetup({ busy, onConnect, onFile }: Props) {
  const id = useId();
  const [token, setToken] = useState("");
  const [queryId, setQueryId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const t = token.trim();
    const q = queryId.trim();
    if (!/^\d{1,12}$/.test(q)) return setError("The Query ID is a number, shown next to your Flex Query.");
    if (!/^[A-Za-z0-9]{10,64}$/.test(t)) return setError("Paste the whole token (letters and digits).");
    setError(null);
    onConnect(t, q);
  };

  return (
    <div className="space-y-4">
      <ol className="space-y-1.5 text-[13px] text-muted">
        {STEPS.map((step, i) => (
          <li key={i} className="flex gap-2.5">
            <span className="mt-px inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-line text-[11px] font-semibold text-fg">{i + 1}</span>
            <span>
              {step.text}{" "}
              {step.link && (
                <a href={step.link.href} target="_blank" rel="noreferrer" className="font-medium text-fg underline underline-offset-2">
                  {step.link.label}
                </a>
              )}
            </span>
          </li>
        ))}
      </ol>
      <form onSubmit={submit} className="space-y-2.5" noValidate>
        <div className="grid gap-2.5 sm:grid-cols-[160px_minmax(0,1fr)]">
          <label className="block space-y-1">
            <span className="text-[12.5px] font-medium text-muted">Query ID</span>
            <input value={queryId} onChange={(e) => setQueryId(e.target.value)} inputMode="numeric" autoComplete="off" placeholder="1234567" className={inputCls} />
          </label>
          <label className="block space-y-1">
            <span className="text-[12.5px] font-medium text-muted">Flex token</span>
            <input type="password" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" spellCheck={false} placeholder="Paste the token" className={`${inputCls} font-mono`} />
          </label>
        </div>
        {error && <p className="text-[12.5px] text-down">{error}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" disabled={busy} className={btnPrimary}>
            Connect IBKR
          </button>
          <label htmlFor={`${id}-file`} className={`${btn} ${busy ? "pointer-events-none opacity-50" : ""}`}>
            Or upload a Flex XML file
          </label>
          <input id={`${id}-file`} type="file" accept=".xml,text/xml,application/xml" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
        </div>
        <p className="text-[12px] text-faint">Read-only: a Flex token can read reports, not trade or move money. It is saved only in this browser.</p>
      </form>
    </div>
  );
}
