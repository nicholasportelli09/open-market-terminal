/**
 * Safe parsing of untrusted portfolio JSON (file import, localStorage). Copies only known fields
 * of the right primitive type into fresh objects, so prototype tricks or extra keys never survive.
 */
import { normalizeSymbol } from "./model";
import { ASSET_TYPES, PORTFOLIO_SCHEMA_VERSION, TRANSACTION_TYPES, type AssetType, type Portfolio, type Transaction } from "./types";

export type ParseResult = { ok: true; portfolio: Portfolio } | { ok: false; errors: string[] };

/** Upper bound so a hostile file cannot make the app churn through millions of rows. */
export const MAX_TRANSACTIONS = 20_000;
const MAX_TEXT = 500;

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (o: Obj, k: string): string | undefined =>
  typeof o[k] === "string" ? (o[k] as string).slice(0, MAX_TEXT) : undefined;
const num = (o: Obj, k: string): number | undefined =>
  typeof o[k] === "number" && Number.isFinite(o[k]) ? (o[k] as number) : undefined;

/** JSON.parse that returns a result instead of throwing. */
export function safeJsonParse(text: string): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Invalid JSON" };
  }
}

function parseTransaction(raw: unknown, index: number, errors: string[]): Transaction | null {
  if (!isObj(raw)) {
    errors.push(`Transaction ${index + 1} is not an object`);
    return null;
  }
  const type = str(raw, "type");
  if (!type || !(TRANSACTION_TYPES as readonly string[]).includes(type)) {
    errors.push(`Transaction ${index + 1} has an unknown type`);
    return null;
  }
  const id = str(raw, "id");
  const date = str(raw, "date");
  const currency = str(raw, "currency");
  const createdAt = str(raw, "createdAt");
  if (!id || !date || !currency || !createdAt) {
    errors.push(`Transaction ${index + 1} is missing id, date, currency or createdAt`);
    return null;
  }
  const assetType = str(raw, "assetType");
  const tx: Transaction = {
    id,
    date,
    type: type as Transaction["type"],
    currency,
    createdAt,
    updatedAt: str(raw, "updatedAt") ?? createdAt,
  };
  const optional: Partial<Transaction> = {
    symbol: normalizeSymbol(str(raw, "symbol")),
    name: str(raw, "name"),
    assetType: assetType && (ASSET_TYPES as readonly string[]).includes(assetType) ? (assetType as AssetType) : undefined,
    quantity: num(raw, "quantity"),
    price: num(raw, "price"),
    amount: num(raw, "amount"),
    fees: num(raw, "fees"),
    fxToBase: num(raw, "fxToBase"),
    toCurrency: str(raw, "toCurrency"),
    toAmount: num(raw, "toAmount"),
    note: str(raw, "note"),
  };
  const defined = Object.entries(optional).filter(([, v]) => v !== undefined);
  return { ...tx, ...Object.fromEntries(defined) };
}

/**
 * Structural parse of an already-migrated object at the current schema version. Field rules
 * (positive numbers, dates, oversells) are checked separately by validatePortfolio.
 */
export function parsePortfolio(raw: unknown): ParseResult {
  if (!isObj(raw)) return { ok: false, errors: ["File does not contain a portfolio object"] };
  if (raw.version !== PORTFOLIO_SCHEMA_VERSION) {
    return { ok: false, errors: [`Unsupported portfolio version ${String(raw.version)}`] };
  }
  const id = str(raw, "id");
  const name = str(raw, "name");
  const baseCurrency = str(raw, "baseCurrency");
  const createdAt = str(raw, "createdAt");
  const errors: string[] = [];
  if (!id) errors.push("Portfolio id is missing");
  if (!name) errors.push("Portfolio name is missing");
  if (!baseCurrency) errors.push("Base currency is missing");
  if (!createdAt) errors.push("createdAt is missing");
  if (!Array.isArray(raw.transactions)) errors.push("transactions must be a list");
  else if (raw.transactions.length > MAX_TRANSACTIONS) errors.push(`More than ${MAX_TRANSACTIONS} transactions`);
  if (errors.length > 0) return { ok: false, errors };

  const list = raw.transactions as unknown[];
  const transactions = list.map((t, i) => parseTransaction(t, i, errors));
  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    portfolio: {
      version: PORTFOLIO_SCHEMA_VERSION,
      id: id as string,
      name: name as string,
      baseCurrency: baseCurrency as string,
      transactions: transactions as Transaction[],
      createdAt: createdAt as string,
      updatedAt: str(raw, "updatedAt") ?? (createdAt as string),
    },
  };
}
