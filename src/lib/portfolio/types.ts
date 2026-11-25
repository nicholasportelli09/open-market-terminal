/**
 * Portfolio data model. Pure types, shared by the engine, storage and the UI.
 *
 * Money conventions:
 * - "local" amounts are in the transaction's / instrument's own currency.
 * - "base" amounts are in the portfolio's base currency.
 * - fxToBase = units of base currency per 1 unit of the transaction currency, on the trade date.
 */
import type { PriceSession, SourceId } from "@/lib/provenance";

/** ISO 4217 three-letter code, upper case (validated by /^[A-Z]{3}$/). */
export type Currency = string;

export type TransactionType =
  | "buy"
  | "sell"
  | "deposit"
  | "withdrawal"
  | "dividend"
  | "interest"
  | "fee"
  | "fx";

export const TRANSACTION_TYPES: readonly TransactionType[] = [
  "buy",
  "sell",
  "deposit",
  "withdrawal",
  "dividend",
  "interest",
  "fee",
  "fx",
];

export type AssetType = "stock" | "etf" | "fund" | "crypto" | "other";

export const ASSET_TYPES: readonly AssetType[] = ["stock", "etf", "fund", "crypto", "other"];

/** Transaction types that carry a symbol, quantity and price. */
export const TRADE_TYPES: readonly TransactionType[] = ["buy", "sell"];

/** Transaction types that carry a single cash `amount`. */
export const CASH_TYPES: readonly TransactionType[] = ["deposit", "withdrawal", "dividend", "interest", "fee"];

export type Transaction = {
  id: string;
  /** Trade / value date, YYYY-MM-DD. */
  date: string;
  type: TransactionType;
  symbol?: string;
  name?: string;
  assetType?: AssetType;
  /** Units bought or sold (buy / sell). Always positive. */
  quantity?: number;
  /** Price per unit in `currency` (buy / sell). Always positive. */
  price?: number;
  currency: Currency;
  /** Cash amount, always positive, for deposit / withdrawal / dividend / interest / fee, and the amount sold for fx. */
  amount?: number;
  /** Commission / fees in `currency` (buy / sell). Non-negative. */
  fees?: number;
  /** Units of base currency per 1 unit of `currency` on the trade date (entered or looked up). */
  fxToBase?: number;
  /** fx only: the currency bought. */
  toCurrency?: Currency;
  /** fx only: the amount of `toCurrency` received. */
  toAmount?: number;
  note?: string;
  /** ISO timestamps. createdAt also breaks ties between transactions on the same date. */
  createdAt: string;
  updatedAt: string;
};

export const PORTFOLIO_SCHEMA_VERSION = 1 as const;

export type Portfolio = {
  version: typeof PORTFOLIO_SCHEMA_VERSION;
  id: string;
  name: string;
  baseCurrency: Currency;
  transactions: Transaction[];
  createdAt: string;
  updatedAt: string;
};

/** A current price for a symbol, with its provenance. */
export type PriceInput = {
  price: number;
  currency: Currency;
  /** ISO timestamp the price was true as of. */
  asOf: string;
  session?: PriceSession;
  source: SourceId;
  /** Previous regular-session close in the same currency; enables dayChange. */
  previousClose?: number;
};

/** A current FX rate: units of base currency per 1 unit of the keyed currency. */
export type FxInput = {
  rateToBase: number;
  asOf: string;
  source: SourceId;
};

export type PriceMap = Record<string, PriceInput>;
export type FxMap = Record<Currency, FxInput>;
