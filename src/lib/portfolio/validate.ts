/**
 * Validation for transactions and portfolios entered by the user or imported from a file.
 * Never trusts its input: every check works on values that may be missing or of the wrong type.
 */
import { EPSILON, sortTransactions, todayIso } from "./order";
import { TRANSACTION_TYPES, type Portfolio, type Transaction } from "./types";

export const SYMBOL_PATTERN = /^[A-Za-z0-9.\-=^]{1,20}$/;
export const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export type FieldError = { field: keyof Transaction | "transaction"; message: string };

export type PortfolioIssue = {
  /** Null for portfolio-level problems (name, base currency). */
  transactionId: string | null;
  field?: string;
  message: string;
};

export type ValidateOptions = {
  /** YYYY-MM-DD treated as today (dates after it are rejected). Defaults to the device's local date. */
  today?: string;
};

/** True for a real calendar date in YYYY-MM-DD form (rejects 2026-02-30). */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

const isPositive = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;
const isNonNegative = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;

function checkPositive(errors: FieldError[], field: keyof Transaction, value: unknown, label: string): void {
  if (value === undefined || value === null) errors.push({ field, message: `${label} is required` });
  else if (!isPositive(value)) errors.push({ field, message: `${label} must be a positive number` });
}

function checkSymbol(errors: FieldError[], symbol: unknown, required: boolean): void {
  if (symbol === undefined || symbol === "") {
    if (required) errors.push({ field: "symbol", message: "Symbol is required" });
    return;
  }
  if (typeof symbol !== "string" || !SYMBOL_PATTERN.test(symbol)) {
    errors.push({ field: "symbol", message: "Symbol must be 1-20 letters, digits or . - = ^" });
  }
}

function checkCurrency(errors: FieldError[], field: "currency" | "toCurrency", value: unknown): void {
  if (typeof value !== "string" || !CURRENCY_PATTERN.test(value)) {
    errors.push({ field, message: "Currency must be a 3-letter ISO code such as USD" });
  }
}

/** Field-level checks for one transaction. Returns [] when valid. */
export function validateTransaction(tx: Partial<Transaction>, options: ValidateOptions = {}): FieldError[] {
  const errors: FieldError[] = [];
  const today = options.today ?? todayIso();

  if (typeof tx.id !== "string" || tx.id.length === 0) errors.push({ field: "id", message: "Missing id" });
  if (!isIsoDate(tx.date)) errors.push({ field: "date", message: "Date must be a valid YYYY-MM-DD date" });
  else if (tx.date > today) errors.push({ field: "date", message: "Date cannot be in the future" });
  if (!tx.type || !TRANSACTION_TYPES.includes(tx.type)) {
    errors.push({ field: "type", message: "Unknown transaction type" });
    return errors;
  }
  checkCurrency(errors, "currency", tx.currency);
  if (tx.fxToBase !== undefined && !isPositive(tx.fxToBase)) {
    errors.push({ field: "fxToBase", message: "FX rate must be a positive number" });
  }

  switch (tx.type) {
    case "buy":
    case "sell":
      checkSymbol(errors, tx.symbol, true);
      checkPositive(errors, "quantity", tx.quantity, "Quantity");
      checkPositive(errors, "price", tx.price, "Price");
      if (tx.fees !== undefined && !isNonNegative(tx.fees)) {
        errors.push({ field: "fees", message: "Fees must be zero or a positive number" });
      }
      break;
    case "fx":
      checkPositive(errors, "amount", tx.amount, "Amount sold");
      checkCurrency(errors, "toCurrency", tx.toCurrency);
      checkPositive(errors, "toAmount", tx.toAmount, "Amount received");
      if (tx.toCurrency === tx.currency) {
        errors.push({ field: "toCurrency", message: "Choose two different currencies" });
      }
      break;
    default:
      checkPositive(errors, "amount", tx.amount, "Amount");
      checkSymbol(errors, tx.symbol, false);
  }
  return errors;
}

/**
 * Whole-portfolio checks: every transaction is valid, ids are unique, each symbol trades in one
 * currency, and no sell exceeds the quantity held as of that date (in ledger order).
 */
export function validatePortfolio(portfolio: Portfolio, options: ValidateOptions = {}): PortfolioIssue[] {
  const issues: PortfolioIssue[] = [];
  if (typeof portfolio.name !== "string" || portfolio.name.trim() === "") {
    issues.push({ transactionId: null, field: "name", message: "Portfolio name is required" });
  }
  if (!CURRENCY_PATTERN.test(portfolio.baseCurrency ?? "")) {
    issues.push({ transactionId: null, field: "baseCurrency", message: "Base currency must be a 3-letter ISO code" });
  }

  const seen = new Set<string>();
  for (const tx of portfolio.transactions) {
    if (seen.has(tx.id)) issues.push({ transactionId: tx.id, field: "id", message: `Duplicate transaction id ${tx.id}` });
    seen.add(tx.id);
    for (const e of validateTransaction(tx, options)) {
      issues.push({ transactionId: tx.id, field: e.field, message: e.message });
    }
  }
  if (issues.length > 0) return issues;

  const held = new Map<string, number>();
  const tradeCurrency = new Map<string, string>();
  for (const tx of sortTransactions(portfolio.transactions)) {
    if (tx.type !== "buy" && tx.type !== "sell") continue;
    const symbol = tx.symbol as string;
    const qty = tx.quantity as number;
    const ccy = tradeCurrency.get(symbol);
    if (ccy !== undefined && ccy !== tx.currency) {
      issues.push({
        transactionId: tx.id,
        field: "currency",
        message: `${symbol} was traded in ${ccy}; this ${tx.type} on ${tx.date} uses ${tx.currency}. Use one currency per symbol.`,
      });
      continue;
    }
    tradeCurrency.set(symbol, tx.currency);
    const current = held.get(symbol) ?? 0;
    if (tx.type === "buy") {
      held.set(symbol, current + qty);
      continue;
    }
    if (qty > current + EPSILON) {
      issues.push({
        transactionId: tx.id,
        field: "quantity",
        message: `Sell of ${qty} ${symbol} on ${tx.date} (transaction ${tx.id}) exceeds the ${current} held on that date`,
      });
      continue;
    }
    held.set(symbol, current - qty);
  }
  return issues;
}
