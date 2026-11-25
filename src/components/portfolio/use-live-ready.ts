"use client";

import { useEffect, useState } from "react";
import { useFeedStatus } from "@/lib/client/quote-store";
import type { Quote } from "@/lib/types";

/** Polls that must finish after the symbol set changes before a missing quote counts as missing. */
const POLLS_TO_SETTLE = 2;

export type LiveReady = {
  /** Every requested quote arrived, enough polls ran that the missing ones are really missing, or the feed is failing. */
  ready: boolean;
  /** The quote feed's last poll failed. */
  feedError: boolean;
};

/**
 * Whether live prices for the portfolio have settled. The second poll that completes after the
 * symbol set changed must have started after it (polls never overlap), so it included every symbol;
 * a quote still absent then is reported as missing instead of loading forever.
 */
export function useLiveReady(quotes: Record<string, Quote | undefined>): LiveReady {
  const { status, updatedAt } = useFeedStatus();
  const symbols = Object.keys(quotes).sort();
  const key = symbols.join(",");
  const allPresent = symbols.every((s) => quotes[s] !== undefined);
  const [track, setTrack] = useState<{ key: string; polls: number; last: number | null }>({ key, polls: 0, last: updatedAt });

  useEffect(() => {
    setTrack((t) => {
      if (t.key !== key) return { key, polls: 0, last: updatedAt };
      if (updatedAt === null || updatedAt === t.last) return t;
      return { key, polls: t.polls + 1, last: updatedAt };
    });
  }, [key, updatedAt]);

  const settled = track.key === key && track.polls >= POLLS_TO_SETTLE;
  const feedError = status === "error" && !allPresent;
  // A failing feed never advances updatedAt, so treat it as settled: show partial totals, not skeletons.
  return { ready: allPresent || settled || feedError, feedError };
}
