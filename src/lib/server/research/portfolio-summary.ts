/**
 * Validation and formatting of the portfolio summary a browser may send with an AI request.
 * Strict: unknown keys, wrong types, out-of-range numbers and oversized payloads are rejected.
 * Pure (no network), unit-tested.
 */
import type { ContextDoc } from "@/lib/server/ai/analyst";
import {
  MAX_PORTFOLIO_CURRENCIES,
  MAX_PORTFOLIO_JSON,
  MAX_PORTFOLIO_POSITIONS,
  type PortfolioPositionSummary,
  type PortfolioSummary,
} from "./types";

export type Validated<T> = { ok: true; value: T } | { ok: false; error: string };

const SYMBOL_RE = /^[A-Z0-9.@=\-^_]{1,24}$/;
const CURRENCY_RE = /^[A-Z]{3}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_MONEY = 1e13;
const MAX_PCT = 1e5;

type Obj = Record<string, unknown>;

class Invalid extends Error {}

function fail(msg: string): never {
  throw new Invalid(msg);
}

function obj(v: unknown, path: string, keys: readonly string[]): Obj {
  if (!v || typeof v !== "object" || Array.isArray(v)) fail(`${path} must be an object.`);
  const o = v as Obj;
  const extra = Object.keys(o).filter((k) => !keys.includes(k));
  if (extra.length) fail(`${path} has unexpected field(s): ${extra.slice(0, 3).join(", ")}.`);
  for (const k of keys) if (!(k in o)) fail(`${path}.${k} is missing.`);
  return o;
}

function finite(v: unknown, path: string, max: number): number {
  if (typeof v !== "number" || !Number.isFinite(v) || Math.abs(v) > max) fail(`${path} must be a finite number.`);
  return v;
}

function pctOrNull(v: unknown, path: string): number | null {
  return v === null ? null : finite(v, path, MAX_PCT);
}

function str(v: unknown, path: string, re: RegExp): string {
  if (typeof v !== "string" || !re.test(v)) fail(`${path} is not valid.`);
  return v;
}

const POSITION_KEYS = ["symbol", "currency", "value", "weightPct", "unrealizedPct"] as const;

function position(v: unknown, i: number): PortfolioPositionSummary {
  const p = obj(v, `positions[${i}]`, POSITION_KEYS);
  return {
    symbol: str(p.symbol, `positions[${i}].symbol`, SYMBOL_RE),
    currency: str(p.currency, `positions[${i}].currency`, CURRENCY_RE),
    value: finite(p.value, `positions[${i}].value`, MAX_MONEY),
    weightPct: pctOrNull(p.weightPct, `positions[${i}].weightPct`),
    unrealizedPct: pctOrNull(p.unrealizedPct, `positions[${i}].unrealizedPct`),
  };
}

const KEYS = ["baseCurrency", "asOf", "totals", "cashPct", "positions", "currencyExposure", "complete"] as const;
const TOTAL_KEYS = ["totalValue", "marketValue", "cash", "unrealized"] as const;

function parse(raw: unknown): PortfolioSummary {
  const o = obj(raw, "portfolio", KEYS);
  const t = obj(o.totals, "portfolio.totals", TOTAL_KEYS);
  if (!Array.isArray(o.positions)) fail("portfolio.positions must be a list.");
  if (o.positions.length > MAX_PORTFOLIO_POSITIONS) fail(`At most ${MAX_PORTFOLIO_POSITIONS} positions can be sent.`);
  if (!Array.isArray(o.currencyExposure)) fail("portfolio.currencyExposure must be a list.");
  if (o.currencyExposure.length > MAX_PORTFOLIO_CURRENCIES) fail(`At most ${MAX_PORTFOLIO_CURRENCIES} currencies can be sent.`);
  if (typeof o.complete !== "boolean") fail("portfolio.complete must be true or false.");
  const asOf = str(o.asOf, "portfolio.asOf", DATE_RE);
  if (!Number.isFinite(Date.parse(`${asOf}T00:00:00Z`))) fail("portfolio.asOf is not a real date.");
  return {
    baseCurrency: str(o.baseCurrency, "portfolio.baseCurrency", CURRENCY_RE),
    asOf,
    totals: {
      totalValue: finite(t.totalValue, "totals.totalValue", MAX_MONEY),
      marketValue: finite(t.marketValue, "totals.marketValue", MAX_MONEY),
      cash: finite(t.cash, "totals.cash", MAX_MONEY),
      unrealized: finite(t.unrealized, "totals.unrealized", MAX_MONEY),
    },
    cashPct: pctOrNull(o.cashPct, "portfolio.cashPct"),
    positions: o.positions.map(position),
    currencyExposure: o.currencyExposure.map((c, i) => {
      const e = obj(c, `currencyExposure[${i}]`, ["currency", "pct"]);
      return { currency: str(e.currency, `currencyExposure[${i}].currency`, CURRENCY_RE), pct: pctOrNull(e.pct, `currencyExposure[${i}].pct`) };
    }),
    complete: o.complete,
  };
}

/** Validates an untrusted portfolio summary (already JSON-parsed). */
export function validatePortfolioSummary(raw: unknown): Validated<PortfolioSummary> {
  let size: number;
  try {
    size = JSON.stringify(raw)?.length ?? 0;
  } catch {
    return { ok: false, error: "portfolio is not serializable." };
  }
  if (size > MAX_PORTFOLIO_JSON) return { ok: false, error: "The portfolio summary is too large." };
  try {
    return { ok: true, value: parse(raw) };
  } catch (err) {
    if (err instanceof Invalid) return { ok: false, error: err.message };
    throw err;
  }
}

const fmt = (n: number) => n.toFixed(2);
const pct = (n: number | null) => (n === null ? "n/a" : `${fmt(n)}%`);

/** Compact text for the model. Every figure here is what the user's browser computed from their own entries. */
export function portfolioContent(p: PortfolioSummary): string {
  const lines = [
    `Base currency: ${p.baseCurrency}. Valued as of ${p.asOf}.${p.complete ? "" : " Incomplete: some prices or FX rates were missing, so totals cover only what could be valued."}`,
    `Total value ${fmt(p.totals.totalValue)} ${p.baseCurrency}; invested ${fmt(p.totals.marketValue)}; cash ${fmt(p.totals.cash)} (${pct(p.cashPct)} of total); unrealized P/L ${fmt(p.totals.unrealized)}.`,
    "Positions (symbol | currency | value in base | weight | unrealized on cost):",
    ...[...p.positions]
      .sort((a, b) => (b.weightPct ?? 0) - (a.weightPct ?? 0))
      .map((x) => `${x.symbol} | ${x.currency} | ${fmt(x.value)} | ${pct(x.weightPct)} | ${pct(x.unrealizedPct)}`),
    `Currency exposure: ${p.currencyExposure.map((c) => `${c.currency} ${pct(c.pct)}`).join(", ") || "n/a"}.`,
  ];
  return lines.join("\n");
}

/** Context doc draft (no id yet) for the analyst. */
export function portfolioDraft(p: PortfolioSummary): Omit<ContextDoc, "id"> {
  return {
    title: "Your saved portfolio (summary sent from this browser)",
    provenance: { source: "user", asOf: p.asOf, session: "n/a", note: "Positions you entered; valued with CNBC prices in your browser" },
    content: portfolioContent(p),
  };
}

/** Stable short hash (FNV-1a, 32-bit) of a summary, for cache keys. "none" without a portfolio. */
export function portfolioHash(p: PortfolioSummary | undefined): string {
  if (!p) return "none";
  const text = JSON.stringify(p);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}
