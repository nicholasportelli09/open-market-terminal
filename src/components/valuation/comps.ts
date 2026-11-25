import type { CompanySnapshot } from "@/lib/company-types";
import type { CompanyMetrics, MultipleName } from "@/lib/valuation";

/** The multiples the comps table shows, in column order. */
export const COMP_MULTIPLES: readonly MultipleName[] = ["pe", "evSales", "evEbit", "evEbitda", "pFcf"];
export const MAX_PEERS = 8;

const orNaN = (v: number | null): number => (v === null ? Number.NaN : v);
const orUndef = (v: number | null): number | undefined => (v === null ? undefined : v);

/**
 * Engine metrics from a company snapshot. Unavailable required figures become NaN so the engine reports the
 * multiple as not meaningful (with a reason) instead of using a made-up value. When the quote and the
 * filings use different currencies the price is unusable, so every multiple drops out.
 * `price` overrides the snapshot price (the target uses its live price).
 */
export function metricsFromSnapshot(s: CompanySnapshot, price?: number | null): CompanyMetrics {
  const m = s.metrics;
  const p = s.currencyMismatch ? null : price !== undefined ? price : s.price.value;
  return {
    symbol: s.symbol,
    price: orNaN(p),
    shares: orNaN(m.sharesOutstanding.value),
    netDebt: orNaN(m.netDebt.value),
    eps: orUndef(m.epsDilutedTTM.value),
    ebitda: orUndef(m.ebitdaTTM.value),
    ebit: orUndef(m.operatingIncomeTTM.value),
    revenue: orUndef(m.revenueTTM.value),
    fcf: orUndef(m.fcfTTM.value),
  };
}

/** Normalises a typed peer list: upper case, valid tickers, no duplicates, not the target, at most MAX_PEERS. */
export function addPeer(peers: readonly string[], raw: string, target: string): { peers: string[]; error: string | null } {
  const symbol = raw.trim().toUpperCase();
  if (!/^[A-Z0-9.\-]{1,12}$/.test(symbol)) return { peers: [...peers], error: "Enter a valid ticker, e.g. MSFT." };
  if (symbol === target.toUpperCase()) return { peers: [...peers], error: `${symbol} is the company you are valuing.` };
  if (peers.includes(symbol)) return { peers: [...peers], error: `${symbol} is already in the list.` };
  if (peers.length >= MAX_PEERS) return { peers: [...peers], error: `At most ${MAX_PEERS} peers.` };
  return { peers: [...peers, symbol], error: null };
}
