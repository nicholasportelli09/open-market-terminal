"use client";

import { useEffect, useMemo, useState } from "react";
import { moneyWeightedReturn, simpleTotalReturn, valuePortfolio, type PortfolioValuation } from "@/lib/portfolio";
import { useQuotes } from "./quote-store";
import { fxMapFromQuotes, fxSymbol, priceMapFromQuotes } from "./fx-quotes";
import { usePortfolioState } from "./portfolio-store";

const CLOCK_MS = 30_000;

/** Symbols and currencies the portfolio needs live data for. */
function needs(p: ReturnType<typeof usePortfolioState>["portfolio"]) {
  if (!p) return { symbols: [] as string[], currencies: [] as string[] };
  const symbols = new Set<string>();
  const currencies = new Set<string>([p.baseCurrency]);
  for (const t of p.transactions) {
    if (t.symbol) symbols.add(t.symbol);
    currencies.add(t.currency);
    if (t.toCurrency) currencies.add(t.toCurrency);
  }
  return { symbols: [...symbols].sort(), currencies: [...currencies].sort() };
}

/**
 * Live valuation of the saved portfolio: CNBC prices + FX through the shared quote poller, valued
 * by the portfolio engine. Missing prices / rates are reported by the engine, never filled in.
 */
export function usePortfolioValuation() {
  const state = usePortfolioState();
  const { portfolio } = state;
  const { symbols, currencies } = useMemo(() => needs(portfolio), [portfolio]);
  const fxSymbols = useMemo(() => currencies.map(fxSymbol).filter((s): s is string => !!s), [currencies]);
  const quotes = useQuotes(useMemo(() => [...symbols, ...fxSymbols], [symbols, fxSymbols]));
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), CLOCK_MS);
    return () => clearInterval(t);
  }, []);

  const valuation: PortfolioValuation | null = useMemo(() => {
    if (!portfolio) return null;
    const prices = priceMapFromQuotes(symbols, quotes, now);
    const fx = fxMapFromQuotes(portfolio.baseCurrency, currencies, quotes, now);
    return valuePortfolio(portfolio, prices, fx);
  }, [portfolio, symbols, currencies, quotes, now]);

  const returns = useMemo(
    () => (valuation ? { moneyWeighted: moneyWeightedReturn(valuation), simple: simpleTotalReturn(valuation) } : null),
    [valuation],
  );

  const pricesLoaded = symbols.every((s) => quotes[s] !== undefined);
  return { ...state, valuation, returns, quotes, symbols, currencies, pricesLoaded, now };
}
