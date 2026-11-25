/**
 * Currency conversion for valuation. Tracks which currencies had no usable current rate and which
 * historical amounts fell back to the current rate, so the UI can say so instead of hiding it.
 */
import type { Currency, FxMap } from "./types";

export type FxConverter = {
  base: Currency;
  /** Current rate (base per 1 unit), 1 for the base currency, undefined when missing (recorded). */
  current(currency: Currency): number | undefined;
  /**
   * Trade-date rate when known, else the current rate with `fallbackWarning` recorded.
   * Undefined when neither exists (the currency is recorded as missing).
   */
  historical(currency: Currency, fxToBase: number | undefined, fallbackWarning: string): number | undefined;
  missing(): Currency[];
  warnings(): string[];
};

export function createFxConverter(base: Currency, fx: FxMap): FxConverter {
  const missing = new Set<Currency>();
  const warnings = new Set<string>();

  const current = (currency: Currency): number | undefined => {
    if (currency === base) return 1;
    const rate = fx[currency]?.rateToBase;
    if (typeof rate === "number" && Number.isFinite(rate) && rate > 0) return rate;
    missing.add(currency);
    return undefined;
  };

  return {
    base,
    current,
    historical(currency, fxToBase, fallbackWarning) {
      if (currency === base) return 1;
      if (typeof fxToBase === "number" && Number.isFinite(fxToBase) && fxToBase > 0) return fxToBase;
      const rate = current(currency);
      if (rate !== undefined) warnings.add(fallbackWarning);
      return rate;
    },
    missing: () => [...missing].sort(),
    warnings: () => [...warnings],
  };
}

/**
 * Quote currencies in minor units: London prices in pence (CNBC "GBp"), Johannesburg in cents ("ZAc"), Tel Aviv
 * in agorot ("ILA"). Holdings are kept in the major currency, so these quotes are divided by 100.
 */
const MINOR_UNITS: Record<string, Currency> = { GBp: "GBP", GBX: "GBP", ZAc: "ZAR", ZAC: "ZAR", ILA: "ILS" };

/** The major currency and the divisor for a quote currency ("GBp" -> GBP / 100; "USD" -> USD / 1). */
export function majorCurrency(quoteCurrency: string): { currency: Currency; divisor: number } {
  const major = MINOR_UNITS[quoteCurrency];
  return major ? { currency: major, divisor: 100 } : { currency: quoteCurrency, divisor: 1 };
}
