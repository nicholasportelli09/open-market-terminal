/**
 * Return measures.
 * - xirr: annualized internal rate of return of dated cash flows, Excel convention
 *   (actual days / 365). Newton's method first; when it fails, bisection on the log growth over
 *   the whole period (so heavy short-period losses, whose annual rate is close to -100%, solve).
 * - moneyWeightedReturn: xirr of the investor's external flows (deposits, explicit and implicit,
 *   negative; withdrawals positive; the current total value positive on the valuation date).
 *   Periods under a year are never headlined as an annualized figure: both numbers are returned
 *   and `headline` says which one to show.
 * - simpleTotalReturn: (value + withdrawals - deposits) / deposits.
 */
import { daysBetween } from "./order";
import type { PortfolioValuation } from "./valuation-types";

export type DatedFlow = { date: string; amount: number };

const DAYS_PER_YEAR = 365;
const TOLERANCE = 1e-10;
const MAX_NEWTON = 100;
const MAX_BISECTION = 500;
/** Bracket for the log growth factor over the whole period: e^-700 .. e^700 stays finite. */
const LOG_LIMIT = 700;

function npv(rate: number, flows: readonly { t: number; amount: number }[]): number {
  return flows.reduce((s, f) => s + f.amount / Math.pow(1 + rate, f.t), 0);
}

function dNpv(rate: number, flows: readonly { t: number; amount: number }[]): number {
  return flows.reduce((s, f) => s - (f.t * f.amount) / Math.pow(1 + rate, f.t + 1), 0);
}

function newton(flows: { t: number; amount: number }[], guess: number): number | null {
  let r = guess;
  for (let i = 0; i < MAX_NEWTON; i++) {
    const f = npv(r, flows);
    const d = dNpv(r, flows);
    if (!Number.isFinite(f) || !Number.isFinite(d) || d === 0) return null;
    const next = r - f / d;
    if (!Number.isFinite(next) || next <= -1) return null;
    if (Math.abs(next - r) < TOLERANCE) return next;
    r = next;
  }
  return null;
}

type ScaledFlow = { s: number; amount: number };

/** NPV with flows at s in [0, 1] of the period and h = ln(1 + period return). */
function npvLog(h: number, flows: readonly ScaledFlow[]): number {
  return flows.reduce((sum, f) => sum + f.amount * Math.exp(-h * f.s), 0);
}

/**
 * Solves for h = ln(1 + return over the whole period) by bisection. Working in log space over the
 * period keeps the bracket wide and finite: a -30% loss over 10 days is h = ln(0.7), even though
 * its annual rate is -99.9998%.
 */
function periodLogRate(flows: readonly ScaledFlow[]): number | null {
  let lo = -1;
  let hi = 1;
  let fLo = npvLog(lo, flows);
  let fHi = npvLog(hi, flows);
  while (Math.sign(fLo) === Math.sign(fHi) && (lo > -LOG_LIMIT || hi < LOG_LIMIT)) {
    lo = Math.max(-LOG_LIMIT, lo * 2);
    hi = Math.min(LOG_LIMIT, hi * 2);
    fLo = npvLog(lo, flows);
    fHi = npvLog(hi, flows);
  }
  if (!Number.isFinite(fLo) || !Number.isFinite(fHi) || Math.sign(fLo) === Math.sign(fHi)) return null;
  for (let i = 0; i < MAX_BISECTION; i++) {
    const mid = (lo + hi) / 2;
    const fMid = npvLog(mid, flows);
    if (fMid === 0 || (hi - lo) / 2 < TOLERANCE) return mid;
    if (Math.sign(fMid) === Math.sign(fLo)) {
      lo = mid;
      fLo = fMid;
    } else {
      hi = mid;
    }
  }
  return null;
}

function isRealDate(date: string): boolean {
  const ms = Date.parse(`${date}T00:00:00Z`);
  return !Number.isNaN(ms) && new Date(ms).toISOString().slice(0, 10) === date;
}

type Prepared = { timed: { t: number; amount: number }[]; spanDays: number };

/** Validated flows with t in years from the first flow; null when unusable (see xirr). */
function prepare(flows: readonly DatedFlow[]): Prepared | null {
  const nonZero = flows.filter((f) => f.amount !== 0);
  const valid = nonZero.filter((f) => Number.isFinite(f.amount) && isRealDate(f.date));
  if (valid.length !== nonZero.length) return null;
  if (!valid.some((f) => f.amount > 0) || !valid.some((f) => f.amount < 0)) return null;
  const start = valid.reduce((min, f) => (f.date < min ? f.date : min), valid[0].date);
  const days = valid.map((f) => daysBetween(start, f.date));
  const spanDays = Math.max(...days);
  if (spanDays <= 0) return null;
  return { timed: valid.map((f, i) => ({ t: days[i] / DAYS_PER_YEAR, amount: f.amount })), spanDays };
}

/** ln(1 + return over the prepared span), solved in log space. */
function solveSpanLogRate(p: Prepared): number | null {
  const spanYears = p.spanDays / DAYS_PER_YEAR;
  return periodLogRate(p.timed.map((f) => ({ s: f.t / spanYears, amount: f.amount })));
}

/**
 * Annualized IRR of dated flows. Returns null when the flows lack a sign change, a date is not a
 * real calendar date (2021-02-30 is rejected), all flows fall on one day, or no root is found.
 * An annual rate that rounds to -100% (a heavy loss over a few days) is also null: use
 * moneyWeightedReturn, which reports the period return directly.
 */
export function xirr(flows: readonly DatedFlow[], guess = 0.1): number | null {
  const p = prepare(flows);
  if (!p) return null;
  const fromNewton = newton(p.timed, guess);
  if (fromNewton !== null && Math.abs(npv(fromNewton, p.timed)) < 1e-6 * Math.max(1, ...p.timed.map((f) => Math.abs(f.amount)))) {
    return fromNewton;
  }
  const h = solveSpanLogRate(p);
  if (h === null) return null;
  const annual = Math.expm1((h * DAYS_PER_YEAR) / p.spanDays);
  return annual > -1 ? annual : null;
}

export type ReturnUnavailableReason = "incomplete" | "no_flows" | "period_too_short" | "flows_after_valuation" | "no_solution";

export type MoneyWeightedReturn =
  | {
      ok: true;
      method: "xirr";
      startDate: string;
      endDate: string;
      periodDays: number;
      /** Annualized rate (XIRR). Can round to -1 for a heavy loss over a few days. */
      annualized: number;
      /** (1 + annualized)^(days / 365) - 1 over the whole period. */
      cumulative: number;
      /** "annualized" only when the period is at least one year. */
      headline: "annualized" | "cumulative";
      headlineValue: number;
    }
  | { ok: false; reason: ReturnUnavailableReason; message: string };

export function moneyWeightedReturn(valuation: PortfolioValuation): MoneyWeightedReturn {
  if (!valuation.totals.complete) {
    return { ok: false, reason: "incomplete", message: "Some prices or FX rates are missing, so the return cannot be computed" };
  }
  if (valuation.flows.length === 0) {
    return { ok: false, reason: "no_flows", message: "No deposits or trades yet" };
  }
  const startDate = valuation.flows.reduce((min, f) => (f.date < min ? f.date : min), valuation.flows[0].date);
  const endDate = valuation.asOf;
  const periodDays = daysBetween(startDate, endDate);
  if (periodDays <= 0) {
    return { ok: false, reason: "period_too_short", message: "Returns need at least one day of history" };
  }
  if (valuation.flows.some((f) => f.date > endDate)) {
    return { ok: false, reason: "flows_after_valuation", message: "Some deposits or trades are dated after the valuation date" };
  }
  const flows: DatedFlow[] = [
    ...valuation.flows.map((f) => ({ date: f.date, amount: f.amountBase })),
    { date: endDate, amount: valuation.totals.totalValueBase },
  ];
  // Solved as the log growth over the period, so the cumulative figure (the headline under a year)
  // exists even when the annual rate rounds to -100%.
  const prepared = prepare(flows);
  const h = prepared ? solveSpanLogRate(prepared) : null;
  if (!prepared || h === null) {
    return { ok: false, reason: "no_solution", message: "No money-weighted return solves these cash flows" };
  }
  const logPerDay = h / prepared.spanDays;
  const annualized = Math.expm1(logPerDay * DAYS_PER_YEAR);
  const cumulative = Math.expm1(logPerDay * periodDays);
  const headline = periodDays >= DAYS_PER_YEAR ? "annualized" : "cumulative";
  return {
    ok: true,
    method: "xirr",
    startDate,
    endDate,
    periodDays,
    annualized,
    cumulative,
    headline,
    headlineValue: headline === "annualized" ? annualized : cumulative,
  };
}

export type SimpleTotalReturn =
  | { ok: true; valueBase: number; depositsBase: number; withdrawalsBase: number; returnBase: number; returnPct: number }
  | { ok: false; reason: "incomplete" | "no_deposits"; message: string };

export function simpleTotalReturn(valuation: PortfolioValuation): SimpleTotalReturn {
  const t = valuation.totals;
  if (!t.complete) return { ok: false, reason: "incomplete", message: "Some prices or FX rates are missing" };
  if (t.depositsBase <= 0) return { ok: false, reason: "no_deposits", message: "Nothing has been deposited or bought yet" };
  const returnBase = t.totalValueBase + t.withdrawalsBase - t.depositsBase;
  return {
    ok: true,
    valueBase: t.totalValueBase,
    depositsBase: t.depositsBase,
    withdrawalsBase: t.withdrawalsBase,
    returnBase,
    returnPct: returnBase / t.depositsBase,
  };
}
