"use client";

import { useEffect, useId, useRef, useState } from "react";
import { portfolioStore } from "@/lib/client/portfolio-store";
import { useQuote } from "@/lib/client/quote-store";
import { ASSET_TYPES, CURRENCY_PATTERN, majorCurrency, SYMBOL_PATTERN, TRANSACTION_TYPES, todayIso, type Portfolio, type TransactionType } from "@/lib/portfolio";
import { TYPE_LABEL, checkDraft, fieldsFor, formToDraft, type FormErrors, type FormField, type FormValues } from "./form-model";
import { Field, aria } from "./form-fields";
import { FxLookup } from "./fx-lookup";
import { BASE_CURRENCIES } from "./money";
import { SymbolField } from "./symbol-field";
import { Note, btn, btnPrimary, inputCls } from "./ui-bits";
import { assetTypeFromSearch } from "./view-model";

type Props = { portfolio: Portfolio; initial: FormValues; editingId: string | null; onClose: () => void };

const AMOUNT_LABEL: Partial<Record<TransactionType, string>> = {
  deposit: "Amount deposited",
  withdrawal: "Amount withdrawn",
  dividend: "Dividend received (after tax)",
  interest: "Interest received",
  fee: "Fee paid",
  fx: "Amount sold",
};

/** Add / edit dialog. Field errors come from validateTransaction and validatePortfolio via checkDraft. */
export function TransactionForm({ portfolio, initial, editingId, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const uid = useId();
  const base = portfolio.baseCurrency;
  const [values, setValues] = useState<FormValues>(initial);
  const [errors, setErrors] = useState<FormErrors>({});
  const [currencyTouched, setCurrencyTouched] = useState(editingId !== null || initial.currency !== "");
  const [quoteSymbol, setQuoteSymbol] = useState(initial.symbol.trim().toUpperCase());
  const quote = useQuote(SYMBOL_PATTERN.test(quoteSymbol) ? quoteSymbol : "");
  const quoteUnit = quote?.currency ? majorCurrency(quote.currency).currency : null;
  const quoteCurrency = quoteUnit && CURRENCY_PATTERN.test(quoteUnit) ? quoteUnit : null;

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);

  const used = new Set(fieldsFor(values.type));
  const takesSymbol = used.has("symbol");

  useEffect(() => {
    if (!currencyTouched && takesSymbol && quoteCurrency) setValues((v) => (v.currency === quoteCurrency ? v : { ...v, currency: quoteCurrency }));
  }, [currencyTouched, takesSymbol, quoteCurrency]);

  const set = (field: FormField, value: string) => {
    setValues((v) => ({ ...v, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined, form: undefined }));
  };

  /** Cash-only types default to the base currency when no currency was chosen yet. */
  const changeType = (type: TransactionType) => {
    setValues((v) => ({ ...v, type, currency: v.currency || (fieldsFor(type).includes("symbol") ? "" : base) }));
    setErrors({});
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const mapped = formToDraft(values, base);
    if (!mapped.draft) return setErrors(mapped.errors);
    const found = checkDraft(portfolio, mapped.draft, editingId, todayIso());
    if (Object.values(found).some(Boolean)) return setErrors(found);
    const res = editingId ? portfolioStore.update(editingId, mapped.draft) : portfolioStore.add(mapped.draft);
    if (!res.ok) return setErrors({ form: res.message });
    ref.current?.close();
  };

  const id = (f: string) => `${uid}-${f}`;
  const currency = values.currency.trim().toUpperCase();
  const foreign = CURRENCY_PATTERN.test(currency) && currency !== base;
  const isFx = values.type === "fx";
  const num = (f: FormField, label: string, hint?: string) => (
    <Field id={id(f)} label={label} error={errors[f]} hint={hint}>
      <input {...aria(id(f), errors[f], !!hint)} inputMode="decimal" autoComplete="off" value={values[f]} onChange={(e) => set(f, e.target.value)} className={`${inputCls} num`} />
    </Field>
  );

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby={`${uid}-title`}
      className="m-auto w-[min(680px,calc(100vw-24px))] max-h-[calc(100dvh-24px)] overflow-y-auto rounded-2xl border border-line bg-card p-0 text-fg shadow-xl backdrop:bg-black/45"
    >
      <form onSubmit={submit} noValidate>
        <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <h2 id={`${uid}-title`} className="text-[15px] font-semibold">
            {editingId ? "Edit transaction" : "Add transaction"}
          </h2>
          <button type="button" className={btn} onClick={() => ref.current?.close()}>
            Close
          </button>
        </header>
        <div className="grid gap-3.5 px-5 py-4 sm:grid-cols-2">
          <Field id={id("type")} label="Transaction type" error={errors.type}>
            <select {...aria(id("type"), errors.type)} value={values.type} onChange={(e) => changeType(e.target.value as TransactionType)} className={inputCls}>
              {TRANSACTION_TYPES.map((t) => (
                <option key={t} value={t}>{TYPE_LABEL[t]}</option>
              ))}
            </select>
          </Field>
          <Field id={id("date")} label={values.type === "buy" || values.type === "sell" ? "Trade date" : "Date"} error={errors.date}>
            <input {...aria(id("date"), errors.date)} type="date" max={todayIso()} value={values.date} onChange={(e) => set("date", e.target.value)} className={inputCls} />
          </Field>
          {takesSymbol && (
            <Field id={id("symbol")} label={values.type === "dividend" ? "Symbol (optional)" : "Symbol"} error={errors.symbol} hint={quote?.name ? `${quote.name}${quoteCurrency ? `, quoted in ${quoteCurrency} (CNBC)` : ""}` : undefined}>
              <div onBlur={() => setQuoteSymbol(values.symbol.trim().toUpperCase())}>
                <SymbolField
                  id={id("symbol")}
                  value={values.symbol}
                  ariaProps={aria(id("symbol"), errors.symbol, !!quote?.name)}
                  onChange={(s) => set("symbol", s)}
                  onPick={(r) => {
                    setValues((v) => ({ ...v, symbol: r.symbol, name: v.name || r.name, assetType: assetTypeFromSearch(r.type) }));
                    setErrors((e) => ({ ...e, symbol: undefined }));
                    setQuoteSymbol(r.symbol.toUpperCase());
                  }}
                />
              </div>
            </Field>
          )}
          {used.has("name") && (
            <Field id={id("name")} label="Name (optional)" error={errors.name}>
              <input {...aria(id("name"), errors.name)} value={values.name} maxLength={120} onChange={(e) => set("name", e.target.value)} className={inputCls} />
            </Field>
          )}
          {used.has("assetType") && (
            <Field id={id("assetType")} label="Asset type" error={errors.assetType}>
              <select {...aria(id("assetType"), errors.assetType)} value={values.assetType} onChange={(e) => set("assetType", e.target.value)} className={inputCls}>
                {ASSET_TYPES.map((a) => (
                  <option key={a} value={a}>{a === "etf" ? "ETF" : a[0].toUpperCase() + a.slice(1)}</option>
                ))}
              </select>
            </Field>
          )}
          {used.has("quantity") && num("quantity", "Quantity")}
          {used.has("price") && num("price", `Price per unit${currency ? ` (${currency})` : ""}`)}
          {used.has("fees") && num("fees", "Fees (optional)")}
          <Field id={id("currency")} label={isFx ? "Currency sold" : takesSymbol ? "Instrument currency" : "Currency"} error={errors.currency} hint={takesSymbol && quoteCurrency && currency !== quoteCurrency ? `The live quote is in ${quoteCurrency}.` : undefined}>
            <input
              {...aria(id("currency"), errors.currency, !!quoteCurrency)}
              list={`${uid}-ccys`}
              maxLength={3}
              autoComplete="off"
              placeholder={takesSymbol ? "From the quote, e.g. USD" : base}
              value={values.currency}
              onChange={(e) => {
                setCurrencyTouched(true);
                set("currency", e.target.value.toUpperCase());
              }}
              className={`${inputCls} uppercase placeholder:normal-case`}
            />
          </Field>
          {used.has("amount") && num("amount", AMOUNT_LABEL[values.type] ?? "Amount")}
          {used.has("toCurrency") && (
            <Field id={id("toCurrency")} label="Currency bought" error={errors.toCurrency}>
              <input {...aria(id("toCurrency"), errors.toCurrency)} list={`${uid}-ccys`} maxLength={3} autoComplete="off" value={values.toCurrency} onChange={(e) => set("toCurrency", e.target.value.toUpperCase())} className={`${inputCls} uppercase`} />
            </Field>
          )}
          {used.has("toAmount") && num("toAmount", "Amount received")}
          {foreign && (
            <Field id={id("fxToBase")} label={`FX to ${base} on trade date (optional)`} error={errors.fxToBase} hint={`${base} per 1 ${currency}. Without it, cost is converted at today's rate and marked.`} wide>
              <div className="flex flex-wrap items-start gap-2">
                <input {...aria(id("fxToBase"), errors.fxToBase, true)} inputMode="decimal" autoComplete="off" value={values.fxToBase} onChange={(e) => set("fxToBase", e.target.value)} className={`${inputCls} num max-w-[220px]`} />
                <FxLookup key={`${currency}|${values.date}`} currency={currency} base={base} date={values.date} onRate={(r) => set("fxToBase", r)} />
              </div>
            </Field>
          )}
          <Field id={id("note")} label="Note (optional)" error={errors.note} wide>
            <input {...aria(id("note"), errors.note)} value={values.note} maxLength={300} onChange={(e) => set("note", e.target.value)} className={inputCls} />
          </Field>
          <datalist id={`${uid}-ccys`}>
            {BASE_CURRENCIES.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
        {errors.form && (
          <div className="px-5 pb-1" role="alert">
            <Note tone="error">{errors.form}</Note>
          </div>
        )}
        <footer className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3.5">
          <button type="button" className={btn} onClick={() => ref.current?.close()}>
            Cancel
          </button>
          <button type="submit" className={btnPrimary}>
            {editingId ? "Save changes" : "Add transaction"}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
