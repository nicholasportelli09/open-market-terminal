"use client";

import { useEffect, useRef, useState } from "react";
import type { ApiResult } from "@/lib/api-types";
import type { Provenance } from "@/lib/provenance";
import type { FxHistoryData } from "@/app/api/fx-history/route";
import { SourceTags } from "@/components/ui/source-tag";
import { fmtRate } from "./money";
import { btnSmall } from "./ui-bits";

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; data: FxHistoryData; sources: Provenance[] }
  | { status: "error"; message: string };

/** Rounds a looked-up rate for the input field (10 significant digits; never adds digits). */
export function rateForInput(rate: number): string {
  return String(Number(rate.toPrecision(10)));
}

async function lookUp(currency: string, base: string, date: string): Promise<ApiResult<FxHistoryData>> {
  try {
    const qs = new URLSearchParams({ currency, base, date });
    const res = await fetch(`/api/fx-history?${qs}`, { cache: "no-store" });
    const json = (await res.json().catch(() => null)) as ApiResult<FxHistoryData> | null;
    if (json && typeof json.ok === "boolean") return json;
    return { ok: false, code: "upstream", message: `Unexpected response (HTTP ${res.status}).` };
  } catch {
    return { ok: false, code: "upstream", message: "Could not reach the server. Check the connection and try again." };
  }
}

/**
 * "Look up" button for the trade-date FX rate: CNBC close on the date (or the last close before it,
 * with its real date), crossed through USD by /api/fx-history. Fills the field only on success.
 * The parent keys this by currency + date, and a response that returns after the inputs changed or
 * the lookup unmounted is dropped, so a stale rate never reaches the form.
 */
export function FxLookup({ currency, base, date, onRate }: { currency: string; base: string; date: string; onRate: (rate: string) => void }) {
  const [state, setState] = useState<State>({ status: "idle" });
  const latest = useRef({ currency, base, date, mounted: true });
  latest.current = { ...latest.current, currency, base, date };

  useEffect(() => {
    latest.current = { ...latest.current, mounted: true };
    return () => {
      latest.current = { ...latest.current, mounted: false };
    };
  }, []);

  const run = async () => {
    setState({ status: "loading" });
    const res = await lookUp(currency, base, date);
    // Drop a response for inputs that changed (or a lookup that unmounted) while it was in flight.
    const now = latest.current;
    if (!now.mounted || now.currency !== currency || now.base !== base || now.date !== date) return;
    if (!res.ok) {
      setState({ status: "error", message: res.message });
      return;
    }
    onRate(rateForInput(res.data.rate));
    setState({ status: "ok", data: res.data, sources: res.sources });
  };

  return (
    <div className="space-y-1">
      <button type="button" className={btnSmall} onClick={() => void run()} disabled={state.status === "loading"}>
        {state.status === "loading" ? "Looking up..." : "Look up"}
      </button>
      <div aria-live="polite" className="text-[12px] leading-snug">
        {state.status === "error" && <p className="text-down">{state.message}</p>}
        {state.status === "ok" && (
          <div className="space-y-0.5">
            <p className="text-muted">
              1 {currency} = <span className="num text-fg">{fmtRate(state.data.rate)}</span> {base}, close of {state.data.date}
              {state.data.date !== state.data.requestedDate && ` (last close on or before ${state.data.requestedDate})`}
              {!state.data.final && "; today's price, not yet a close"}.
            </p>
            <SourceTags list={state.sources} />
          </div>
        )}
      </div>
    </div>
  );
}
