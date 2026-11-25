"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ApiResult } from "@/lib/api-types";
import type { CompanySnapshot } from "@/lib/company-types";

export type PeerState =
  | { status: "loading" }
  | { status: "ok"; data: CompanySnapshot }
  | { status: "error"; message: string };

async function loadPeer(symbol: string): Promise<PeerState> {
  try {
    const res = await fetch(`/api/company?symbol=${encodeURIComponent(symbol)}`, { cache: "no-store" });
    const body = (await res.json().catch(() => null)) as ApiResult<CompanySnapshot> | null;
    if (body && body.ok) return { status: "ok", data: body.data };
    return { status: "error", message: body && !body.ok ? body.message : `Request failed (HTTP ${res.status}).` };
  } catch (err) {
    return { status: "error", message: err instanceof Error ? err.message : "Request failed." };
  }
}

/** Company snapshots for each peer symbol: fetched once per symbol, in parallel, and cached while mounted. */
export function usePeers(symbols: string[]): { peers: Record<string, PeerState>; retry: (symbol: string) => void } {
  const [peers, setPeers] = useState<Record<string, PeerState>>({});
  const done = useRef(new Set<string>());
  const inflight = useRef(new Set<string>());
  const alive = useRef(true);

  const start = useCallback((symbol: string) => {
    if (inflight.current.has(symbol)) return;
    inflight.current.add(symbol);
    void loadPeer(symbol).then((state) => {
      inflight.current.delete(symbol);
      done.current.add(symbol);
      if (alive.current) setPeers((p) => ({ ...p, [symbol]: state }));
    });
  }, []);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const key = symbols.join(",");
  useEffect(() => {
    (key ? key.split(",") : []).forEach((s) => {
      if (!done.current.has(s)) start(s);
    });
  }, [key, start]);

  const retry = useCallback(
    (symbol: string) => {
      done.current.delete(symbol);
      setPeers((p) => ({ ...p, [symbol]: { status: "loading" } }));
      start(symbol);
    },
    [start],
  );

  const visible = Object.fromEntries(symbols.map((s) => [s, peers[s] ?? ({ status: "loading" } as PeerState)]));
  return { peers: visible, retry };
}
