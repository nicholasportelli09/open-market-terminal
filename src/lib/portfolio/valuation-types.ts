import type { ExternalFlow, ImplicitConversion, LedgerIssue } from "./ledger";
import type { AssetType, Currency, FxInput, PriceInput } from "./types";

export type DayChange = {
  previousClose: number;
  /** quantity * (price - previousClose), local currency. */
  changeLocal: number;
  /** changeLocal at the current FX rate. */
  changeBase: number;
  /** price / previousClose - 1. */
  changePct: number;
};

export type PositionValuation = {
  symbol: string;
  name?: string;
  assetType: AssetType;
  currency: Currency;
  quantity: number;
  /** Average cost per unit of the open lots, local currency, fees included. */
  avgCost: number;
  costBasisLocal: number;
  /** Open lots at their trade-date FX (current FX where none was entered; see warnings). */
  costBasisBase: number;
  marketValueLocal: number;
  marketValueBase: number;
  unrealizedLocal: number;
  unrealizedBase: number;
  /** unrealizedBase / costBasisBase; null when the cost basis is zero. */
  unrealizedPct: number | null;
  /** Price move valued at the historical FX of each lot. */
  priceEffectBase: number;
  /** Currency move on the current market value. priceEffectBase + fxEffectBase = unrealizedBase. */
  fxEffectBase: number;
  /** Share of totalValueBase; null when the total is zero or negative. */
  weight: number | null;
  dayChange?: DayChange;
  /** True when at least one lot had no trade-date FX and was converted at the current rate. */
  costAtCurrentFx: boolean;
  /** The price and FX inputs used, for source / as-of / session labels. */
  price: PriceInput;
  fx: FxInput | null;
};

export type CashValuation = { currency: Currency; amount: number; amountBase: number; fx: FxInput | null };

export type AllocationSlice = { key: string; valueBase: number; pct: number | null };

export type BaseFlow = { date: string; amountBase: number; kind: ExternalFlow["kind"]; transactionId: string };

export type ValuationTotals = {
  marketValueBase: number;
  cashBase: number;
  totalValueBase: number;
  costBasisBase: number;
  unrealizedBase: number;
  realizedBase: number;
  /** Dividends + interest - fees, each at its trade-date FX where entered. */
  incomeBase: number;
  /** Deposits (explicit + implicit) in base. */
  depositsBase: number;
  withdrawalsBase: number;
  netContributionsBase: number;
  /** totalValueBase - netContributionsBase; null when anything is missing (see `complete`). */
  totalReturnBase: number | null;
  /** (value + withdrawals - deposits) / deposits; null when incomplete or nothing was deposited. */
  totalReturnPct: number | null;
  /** False when a price or FX rate is missing: totals then cover only what could be valued. */
  complete: boolean;
};

export type PortfolioValuation = {
  baseCurrency: Currency;
  /** Valuation date, YYYY-MM-DD (terminal date for money-weighted return). */
  asOf: string;
  positions: PositionValuation[];
  cash: CashValuation[];
  totals: ValuationTotals;
  allocation: { byPosition: AllocationSlice[]; byAssetType: AllocationSlice[]; byCurrency: AllocationSlice[] };
  exposure: {
    grossInvestedPct: number | null;
    cashPct: number | null;
    currencyExposure: { currency: Currency; valueBase: number; pct: number | null }[];
  };
  missing: { prices: string[]; fx: Currency[] };
  warnings: string[];
  /** External flows in base currency, investor sign convention: deposits negative, withdrawals positive. */
  flows: BaseFlow[];
  implicitDeposits: ExternalFlow[];
  implicitConversions: ImplicitConversion[];
  ledgerIssues: LedgerIssue[];
};
