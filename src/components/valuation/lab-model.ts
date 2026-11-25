import { expandSeries, type DcfInputs, type DcfMode, type Scenario, type ScenarioId } from "@/lib/valuation";
import type { SavedModel } from "@/lib/client/valuation-models";
import type { LabSeed, SeedKey } from "./seed";

export { computeWacc, DEFAULT_DEBT_SPREAD, sourcedEquity, type MarketInputs, type WaccBreakdown } from "./wacc-model";

/**
 * Valuation Lab state and the pure functions that turn it into engine inputs. Every number the user has
 * not typed comes from a seed (sourced) or from one of the clearly labelled default assumptions below.
 */

export const LAB_MIN_YEARS = 3;
export const LAB_MAX_YEARS = 10;
export const LAB_DEFAULT_YEARS = 5;
/** Default assumptions, always shown as "your assumption" in the UI. */
export const DEFAULT_ERP = 0.05;
export const DEFAULT_TERMINAL_GROWTH = 0.025;
/** Starting bear / bull cases: base -/+ these, in decimals. */
export const CASE_GROWTH_SHIFT = 0.03;
export const CASE_MARGIN_SHIFT = 0.03;
export const CASE_WACC_SHIFT = 0.01;

export type ScenarioDraft = {
  id: ScenarioId;
  label: string;
  /** Constant revenue growth for every year; null = same as base. */
  growth: number | null;
  /** Constant FCF or EBIT margin (per mode); null = same as base. */
  margin: number | null;
  wacc: number | null;
  terminalGrowth: number | null;
  /** The user's probability (0-1); null = not entered yet. */
  weight: number | null;
};

export type WaccDraft = {
  /** Overrides; null = use the sourced value. */
  riskFree: number | null;
  beta: number | null;
  erp: number;
  /** Pre-tax cost of debt; null = risk-free + DEFAULT_DEBT_SPREAD. */
  costOfDebt: number | null;
  /** Market value of equity and debt for the weights; null = sourced (see sourcedEquity / total debt). */
  equityValue: number | null;
  debtValue: number | null;
  /** True when the user types the WACC directly instead of building it. */
  useDirect: boolean;
  /** The directly entered WACC (used when useDirect). */
  direct: number | null;
};

export type LabState = {
  years: number;
  mode: DcfMode;
  growth: (number | null)[];
  /** False while growth still follows the seeded fade, so changing years re-fades it. */
  growthEdited: boolean;
  fcfMargin: (number | null)[];
  ebitMargin: (number | null)[];
  overrides: Partial<Record<SeedKey, number>>;
  terminalGrowth: number;
  midYear: boolean;
  wacc: WaccDraft;
  scenarios: ScenarioDraft[];
};

/** Linear fade from the starting growth in year 1 to terminal growth in the final year. */
export function fadeGrowth(start: number | null, terminal: number, years: number): number[] {
  const from = start ?? terminal;
  return Array.from({ length: years }, (_, i) => (years === 1 ? from : from + ((terminal - from) * i) / (years - 1)));
}

const constant = (v: number | null, years: number) => Array.from({ length: years }, () => v);

export function defaultScenarios(): ScenarioDraft[] {
  const empty = { growth: null, margin: null, wacc: null, terminalGrowth: null, weight: null };
  return [
    { id: "bear", label: "Bear", ...empty },
    { id: "base", label: "Base", ...empty },
    { id: "bull", label: "Bull", ...empty },
  ];
}

const avg = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x !== null);
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
};
const shift = (v: number | null, d: number) => (v === null ? null : Number((v + d).toFixed(6)));

/** Bear / bull starting cases around the current base: growth and margin -/+ 3 pp, WACC +/- 1 pp. */
export function startingCases(state: LabState, baseWacc: number | null): ScenarioDraft[] {
  const g = avg(state.growth.slice(0, state.years));
  const m = avg((state.mode === "fcfMargin" ? state.fcfMargin : state.ebitMargin).slice(0, state.years));
  return state.scenarios.map((s) => {
    if (s.id === "base") return { ...s, growth: null, margin: null, wacc: null, terminalGrowth: null };
    const sign = s.id === "bull" ? 1 : -1;
    return {
      ...s,
      growth: shift(g, sign * CASE_GROWTH_SHIFT),
      margin: shift(m, sign * CASE_MARGIN_SHIFT),
      wacc: shift(baseWacc, -sign * CASE_WACC_SHIFT),
      terminalGrowth: null,
    };
  });
}

export function initialLabState(seed: LabSeed, years = LAB_DEFAULT_YEARS): LabState {
  return {
    years,
    mode: "fcfMargin",
    growth: fadeGrowth(seed.startGrowth.value, DEFAULT_TERMINAL_GROWTH, years),
    growthEdited: false,
    fcfMargin: constant(seed.fcfMargin.value, years),
    ebitMargin: constant(seed.ebitMargin.value, years),
    overrides: {},
    terminalGrowth: DEFAULT_TERMINAL_GROWTH,
    midYear: false,
    wacc: { riskFree: null, beta: null, erp: DEFAULT_ERP, costOfDebt: null, equityValue: null, debtValue: null, useDirect: false, direct: null },
    scenarios: defaultScenarios(),
  };
}

const resize = (xs: (number | null)[], years: number) =>
  Array.from({ length: years }, (_, i) => (i < xs.length ? xs[i] : xs[xs.length - 1] ?? null));

/** Changes the horizon: an unedited growth path is re-faded, edited series are cut or extended with their last value. */
export function withYears(state: LabState, seed: LabSeed, years: number): LabState {
  const n = Math.min(LAB_MAX_YEARS, Math.max(LAB_MIN_YEARS, Math.round(years)));
  return {
    ...state,
    years: n,
    growth: state.growthEdited ? resize(state.growth, n) : fadeGrowth(seed.startGrowth.value, state.terminalGrowth, n),
    fcfMargin: resize(state.fcfMargin, n),
    ebitMargin: resize(state.ebitMargin, n),
  };
}

/** Sets terminal growth; an unedited growth path keeps fading towards it. */
export function withTerminalGrowth(state: LabState, seed: LabSeed, g: number): LabState {
  const growth = state.growthEdited ? state.growth : fadeGrowth(seed.startGrowth.value, g, state.years);
  return { ...state, terminalGrowth: g, growth };
}

/**
 * Switches the cash flow method. Scenario margin overrides are cleared: an FCF margin and an EBIT margin are
 * different quantities, so carrying the number across would silently change its meaning.
 */
export function withMode(state: LabState, mode: DcfMode): LabState {
  if (mode === state.mode) return state;
  return { ...state, mode, scenarios: state.scenarios.map((d) => ({ ...d, margin: null })) };
}

export function effectiveSeed(state: LabState, seed: LabSeed, key: SeedKey): number | null {
  return state.overrides[key] ?? seed[key].value;
}

export type BuiltInputs = { inputs: DcfInputs; missing: [] } | { inputs: null; missing: string[] };

const numbersOrNull = (xs: (number | null)[]) => (xs.every((x): x is number => x !== null) ? xs : null);

/** Engine inputs from the lab state, or the list of inputs the user still has to enter. */
export function buildInputs(state: LabState, seed: LabSeed, wacc: number | null): BuiltInputs {
  const years = state.years;
  const growth = numbersOrNull(state.growth.slice(0, years));
  const margins = numbersOrNull((state.mode === "fcfMargin" ? state.fcfMargin : state.ebitMargin).slice(0, years));
  const baseRevenue = effectiveSeed(state, seed, "baseRevenue");
  const shares = effectiveSeed(state, seed, "sharesDiluted");
  const netDebt = effectiveSeed(state, seed, "netDebt");
  const taxRate = effectiveSeed(state, seed, "taxRate");
  const s2c = effectiveSeed(state, seed, "salesToCapital");
  const fundamental = state.mode === "fundamental";
  const missing = [
    baseRevenue === null && "base revenue",
    shares === null && "share count",
    netDebt === null && "net debt",
    !growth && "revenue growth for every year",
    !margins && `${fundamental ? "EBIT" : "FCF"} margin for every year`,
    fundamental && taxRate === null && "tax rate",
    fundamental && s2c === null && "sales to capital",
    wacc === null && "discount rate (WACC)",
  ].filter((x): x is string => !!x);
  if (missing.length || !growth || !margins || baseRevenue === null || shares === null || netDebt === null || wacc === null) {
    return { inputs: null, missing };
  }
  const inputs: DcfInputs = {
    baseRevenue,
    years,
    revenueGrowth: growth,
    mode: state.mode,
    wacc,
    terminalGrowth: state.terminalGrowth,
    netDebt,
    sharesDiluted: shares,
    midYear: state.midYear,
    // Tax rate and sales to capital are kept in FCF mode too (the engine ignores them there) so a saved model keeps them.
    ...(taxRate !== null ? { taxRate } : {}),
    ...(s2c !== null ? { salesToCapital: s2c } : {}),
    ...(fundamental ? { ebitMargin: margins } : { fcfMargin: margins }),
  };
  return { inputs, missing: [] };
}

/** Engine scenarios from the drafts; an empty override means "same as base". */
export function toScenarios(drafts: ScenarioDraft[], mode: DcfMode): Scenario[] {
  return drafts.map((d) => {
    const overrides: Partial<DcfInputs> = {};
    if (d.growth !== null) overrides.revenueGrowth = [d.growth];
    if (d.margin !== null) overrides[mode === "fcfMargin" ? "fcfMargin" : "ebitMargin"] = [d.margin];
    if (d.wacc !== null) overrides.wacc = d.wacc;
    if (d.terminalGrowth !== null) overrides.terminalGrowth = d.terminalGrowth;
    return { id: d.id, label: d.label, overrides, weight: d.weight ?? 0 };
  });
}

export function fromScenarios(list: Scenario[], mode: DcfMode): ScenarioDraft[] {
  return defaultScenarios().map((def) => {
    const s = list.find((x) => x.id === def.id);
    if (!s) return def;
    const o = s.overrides;
    const margin = mode === "fcfMargin" ? o.fcfMargin : o.ebitMargin;
    return {
      ...def,
      label: s.label || def.label,
      growth: o.revenueGrowth?.[0] ?? null,
      margin: margin?.[0] ?? null,
      wacc: o.wacc ?? null,
      terminalGrowth: o.terminalGrowth ?? null,
      weight: s.weight > 0 ? s.weight : null,
    };
  });
}

const same = (a: number, b: number | null) => b !== null && Math.abs(a - b) <= Math.abs(b) * 1e-9;

/** Lab state from a saved model: values equal to today's seeds stay sourced, others become your assumptions. */
export function stateFromSaved(model: SavedModel, seed: LabSeed): LabState {
  const i = model.inputs;
  const years = Math.min(LAB_MAX_YEARS, Math.max(LAB_MIN_YEARS, Math.round(i.years)));
  const base = initialLabState(seed, years);
  const overrides: Partial<Record<SeedKey, number>> = {};
  const keep = (key: SeedKey, v: number | undefined) => {
    if (v !== undefined && !same(v, seed[key].value)) overrides[key] = v;
  };
  keep("baseRevenue", i.baseRevenue);
  keep("sharesDiluted", i.sharesDiluted);
  keep("netDebt", i.netDebt);
  keep("taxRate", i.taxRate);
  keep("salesToCapital", i.salesToCapital);
  return {
    ...base,
    mode: i.mode,
    growth: expandSeries(i.revenueGrowth, years),
    growthEdited: true,
    fcfMargin: i.fcfMargin?.length ? expandSeries(i.fcfMargin, years) : base.fcfMargin,
    ebitMargin: i.ebitMargin?.length ? expandSeries(i.ebitMargin, years) : base.ebitMargin,
    overrides,
    terminalGrowth: i.terminalGrowth,
    midYear: i.midYear ?? false,
    wacc: { ...base.wacc, useDirect: true, direct: i.wacc },
    scenarios: fromScenarios(model.scenarios, i.mode),
  };
}

export type Update = (fn: (s: LabState) => LabState) => void;

/** What every editing panel receives from the workspace. */
export type LabCtx = { state: LabState; update: Update; seed: LabSeed; currency: string };
