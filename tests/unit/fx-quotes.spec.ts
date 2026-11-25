import { expect, test } from "@playwright/test";
import { fxMapFromQuotes, usdPerUnit } from "@/lib/client/fx-quotes";
import type { Quote } from "@/lib/types";

const q = (symbol: string, name: string, last: number): Quote =>
  ({ symbol, name, type: "CURRENCY", exchange: "", currency: "", last, change: 0, changePct: 0, decimals: 4, isYield: false, open: null, high: null, low: null, prevClose: null, volume: null, time: "2026-11-20T16:59:00.000-0500", timeText: "", marketStatus: "", fundamentals: {}, events: {}, extended: null, delayed: false }) as Quote;

test("pair direction is read from the CNBC name", () => {
  expect(usdPerUnit("EUR", q("EUR=", "EUR/USD", 1.1))).toBeCloseTo(1.1, 12);
  expect(usdPerUnit("JPY", q("JPY=", "USD/JPY", 160))).toBeCloseTo(1 / 160, 12);
  expect(usdPerUnit("SEK", q("SEK=", "US Dollar/Swedish Krona FX Spot Rate", 10))).toBeCloseTo(0.1, 12);
  expect(usdPerUnit("XYZ", q("XYZ=", "Something else", 3))).toBeNull();
});

test("cross rates go through USD: CHF base, EUR and USD holdings", () => {
  const quotes = { "CHF=": q("CHF=", "USD/CHF", 0.8), "EUR=": q("EUR=", "EUR/USD", 1.1) };
  const fx = fxMapFromQuotes("CHF", ["CHF", "EUR", "USD"], quotes, new Date("2026-11-21T12:00:00Z"));
  // 1 USD = 0.8 CHF; 1 EUR = 1.1 USD = 0.88 CHF.
  expect(fx.USD.rateToBase).toBeCloseTo(0.8, 12);
  expect(fx.EUR.rateToBase).toBeCloseTo(0.88, 12);
  expect(fx.CHF).toBeUndefined();
});
