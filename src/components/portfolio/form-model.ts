/**
 * Pure mapping between the transaction form (strings, as typed) and engine drafts, plus the checks
 * that turn engine validation into field-level form errors. No React.
 */
import {
  addTransaction,
  createTransaction,
  updateTransaction,
  validatePortfolio,
  validateTransaction,
  type AssetType,
  type FieldError,
  type Portfolio,
  type TransactionDraft,
  type TransactionType,
  type Transaction,
} from "@/lib/portfolio";

export type FormValues = {
  type: TransactionType;
  date: string;
  symbol: string;
  name: string;
  assetType: AssetType;
  quantity: string;
  price: string;
  fees: string;
  currency: string;
  amount: string;
  toCurrency: string;
  toAmount: string;
  fxToBase: string;
  note: string;
};

export type FormField = keyof FormValues;
export type FormErrors = Partial<Record<FormField | "form", string>>;

export const TYPE_LABEL: Record<TransactionType, string> = {
  buy: "Buy",
  sell: "Sell",
  deposit: "Deposit",
  withdrawal: "Withdrawal",
  dividend: "Dividend",
  interest: "Interest",
  fee: "Fee",
  fx: "FX conversion",
};

/** Which inputs a transaction type uses (fxToBase only when the currency differs from the base). */
export function fieldsFor(type: TransactionType): FormField[] {
  switch (type) {
    case "buy":
    case "sell":
      return ["date", "symbol", "name", "assetType", "quantity", "price", "fees", "currency", "fxToBase", "note"];
    case "fx":
      return ["date", "currency", "amount", "toCurrency", "toAmount", "fxToBase", "note"];
    case "dividend":
      return ["date", "symbol", "currency", "amount", "fxToBase", "note"];
    default:
      return ["date", "currency", "amount", "fxToBase", "note"];
  }
}

export function emptyForm(type: TransactionType, base: string, today: string): FormValues {
  return {
    type,
    date: today,
    symbol: "",
    name: "",
    assetType: "stock",
    quantity: "",
    price: "",
    fees: "",
    currency: type === "buy" || type === "sell" ? "" : base,
    amount: "",
    toCurrency: "",
    toAmount: "",
    fxToBase: "",
    note: "",
  };
}

const text = (n: number | undefined): string => (n === undefined ? "" : String(n));

export function formFromTransaction(tx: Transaction): FormValues {
  return {
    type: tx.type,
    date: tx.date,
    symbol: tx.symbol ?? "",
    name: tx.name ?? "",
    assetType: tx.assetType ?? "stock",
    quantity: text(tx.quantity),
    price: text(tx.price),
    fees: text(tx.fees),
    currency: tx.currency,
    amount: text(tx.amount),
    toCurrency: tx.toCurrency ?? "",
    toAmount: text(tx.toAmount),
    fxToBase: text(tx.fxToBase),
    note: tx.note ?? "",
  };
}

const THOUSANDS = /^\d{1,3}(,\d{3})+(\.\d+)?$/;
const PLAIN = /^\d*\.?\d+$|^\d+\.$/;

/** "1,234.5" and "1234.5" are numbers; "" is not given; "1,5" is rejected (use a dot for decimals). */
export function parseNumber(input: string): { ok: true; value: number | undefined } | { ok: false; message: string } {
  const s = input.trim().replace(/[\s_]/g, "");
  if (s === "") return { ok: true, value: undefined };
  const clean = THOUSANDS.test(s) ? s.replace(/,/g, "") : s;
  if (s.includes(",") && clean === s) return { ok: false, message: "Use a dot for decimals, e.g. 1234.56" };
  if (!PLAIN.test(clean)) return { ok: false, message: "Enter a positive number, e.g. 1234.56" };
  const value = Number(clean);
  return Number.isFinite(value) ? { ok: true, value } : { ok: false, message: "Enter a positive number" };
}

const NUMERIC: FormField[] = ["quantity", "price", "fees", "amount", "toAmount", "fxToBase"];
const upper = (s: string): string => s.trim().toUpperCase();
const optional = (s: string): string | undefined => (s.trim() === "" ? undefined : s.trim());

/**
 * The draft for the form, with every optional key present (undefined when unused) so an edit that
 * clears a field, or changes the type, never keeps a stale value from the old transaction.
 */
export function formToDraft(values: FormValues, base: string): { draft: TransactionDraft | null; errors: FormErrors } {
  const used = new Set(fieldsFor(values.type));
  const currency = upper(values.currency);
  const errors: FormErrors = {};
  const nums: Partial<Record<FormField, number | undefined>> = {};
  for (const f of NUMERIC) {
    if (!used.has(f) || (f === "fxToBase" && currency === base)) continue;
    const r = parseNumber(values[f]);
    if (r.ok) nums[f] = r.value;
    else errors[f] = r.message;
  }
  if (Object.keys(errors).length > 0) return { draft: null, errors };
  const has = (f: FormField) => used.has(f);
  const draft: TransactionDraft = {
    type: values.type,
    date: values.date.trim(),
    currency,
    symbol: has("symbol") ? optional(upper(values.symbol)) : undefined,
    name: has("name") ? optional(values.name) : undefined,
    assetType: has("assetType") ? values.assetType : undefined,
    quantity: nums.quantity,
    price: nums.price,
    fees: nums.fees,
    amount: nums.amount,
    toCurrency: has("toCurrency") ? optional(upper(values.toCurrency)) : undefined,
    toAmount: nums.toAmount,
    fxToBase: currency === base ? undefined : nums.fxToBase,
    note: optional(values.note),
  };
  return { draft, errors };
}

const FORM_FIELDS = new Set<string>(["type", "date", "symbol", "name", "assetType", "quantity", "price", "fees", "currency", "amount", "toCurrency", "toAmount", "fxToBase", "note"]);

/** Engine messages name internal transaction ids ("(transaction 3f2a...)"); people never see those ids. */
export function readableMessage(message: string): string {
  return message.replace(/\s*\(transaction [^)]+\)/g, "").replace(/Transaction [\w-]{8,}: /g, "");
}

/** Engine field errors keyed by form field; anything without a form field goes to "form". */
export function mapFieldErrors(list: readonly { field?: string; message: string }[]): FormErrors {
  const out: FormErrors = {};
  for (const e of list) {
    const key = e.field && FORM_FIELDS.has(e.field) ? (e.field as FormField) : "form";
    const message = readableMessage(e.message);
    out[key] = out[key] ? `${out[key]}. ${message}` : message;
  }
  return out;
}

/** The portfolio after saving the draft (a new transaction, or the edit of `editingId`). */
export function applyDraft(portfolio: Portfolio, draft: TransactionDraft, editingId: string | null, now: Date = new Date()): Portfolio {
  return editingId ? updateTransaction(portfolio, editingId, draft, now) : addTransaction(portfolio, createTransaction(draft, now), now);
}

/**
 * Field checks (validateTransaction), then whole-portfolio checks (validatePortfolio, e.g. selling
 * more than held) on the portfolio as it would be after saving. Issues on other transactions,
 * such as a later sell that an edit would break, are reported at form level.
 */
export function checkDraft(portfolio: Portfolio, draft: TransactionDraft, editingId: string | null, today: string): FormErrors {
  const fieldErrors: FieldError[] = validateTransaction({ ...draft, id: editingId ?? "draft" }, { today });
  if (fieldErrors.length > 0) return mapFieldErrors(fieldErrors);
  const next = applyDraft(portfolio, draft, editingId);
  const ownId = editingId ?? next.transactions[next.transactions.length - 1]?.id;
  const issues = validatePortfolio(next, { today });
  const own = issues.filter((i) => i.transactionId === ownId);
  const others = issues.filter((i) => i.transactionId !== ownId);
  const errors = mapFieldErrors(own.map((i) => ({ field: i.field, message: i.message })));
  if (others.length > 0) {
    const msg = `This change would break other transactions: ${others.map((i) => readableMessage(i.message)).join("; ")}`;
    errors.form = errors.form ? `${errors.form}. ${msg}` : msg;
  }
  return errors;
}
