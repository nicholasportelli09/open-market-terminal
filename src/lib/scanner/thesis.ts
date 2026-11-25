/**
 * Thesis scenarios: AI-proposed bear/base/bull ASSUMPTIONS, checked here, then valued with the app's own DCF.
 * The AI never states fair values; every number below the assumptions is computed by @/lib/valuation.
 * Pure and client-safe (no network), so it is unit-tested and shared by the route and the UI.
 */
import type { AnalystAnswer, ClaimKind } from "@/lib/ai/types";
import type { Provenance } from "@/lib/provenance";
import { marginOfSafety, runDcf, upside, type DcfInputs } from "@/lib/valuation";

export const SCENARIO_IDS = ["bear", "base", "bull"] as const;
export type ThesisScenarioId = (typeof SCENARIO_IDS)[number];
export const SCENARIO_LABEL: Record<ThesisScenarioId, string> = { bear: "Bear", base: "Base", bull: "Bull" };

export const FORECAST_YEARS = 5;
export const LIMITS = {
  growth: { min: -0.5, max: 0.6 },
  margin: { min: -0.5, max: 0.6 },
  wacc: { min: 0.05, max: 0.15 },
  terminalMax: 0.04,
} as const;

export type ScenarioAssumptions = {
  id: ThesisScenarioId;
  /** Annual revenue growth for forecast years 1..5 (decimals). */
  revenueGrowth: number[];
  /** FCF / revenue for forecast years 1..5 (decimals). */
  fcfMargin: number[];
  terminalGrowth: number;
  wacc: number;
  rationale: string;
  /** Evidence ids (E1, E2...) from the thesis that the rationale relies on. */
  evidence: string[];
};

export type DcfBase = {
  revenueTTM: number;
  netDebt: number;
  shares: number;
  currency: string;
  provenance: { revenueTTM: Provenance; netDebt: Provenance; shares: Provenance };
};

export type ScenarioOutcome = {
  id: ThesisScenarioId;
  label: string;
  assumptions: ScenarioAssumptions;
  /** Fair value per share from runDcf; null when the DCF is invalid (see errors). */
  perShare: number | null;
  enterpriseValue: number | null;
  equityValue: number | null;
  terminalShareOfEv: number | null;
  /** perShare / price - 1. */
  returnPotential: number | null;
  /** 1 - price / perShare. */
  marginOfSafety: number | null;
  errors: string[];
  warnings: string[];
};

export type ThesisEvidence = { id: string; kind: ClaimKind; text: string; section: string; refs: string[] };

export type ThesisPrice = { value: number; currency: string; provenance: Provenance };

export type ThesisResult = {
  symbol: string;
  name: string;
  answer: AnalystAnswer;
  evidence: ThesisEvidence[];
  scenarios: ScenarioOutcome[] | null;
  /** Why there are no scenarios (missing DCF inputs, AI output rejected...). */
  scenariosNote: string | null;
  dcfBase: DcfBase | null;
  price: ThesisPrice | null;
  model: string;
  generatedAt: string;
  warnings: string[];
};

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const pct = (v: number) => `${Math.round(v * 1000) / 10}%`;

function checkPath(name: string, raw: unknown, min: number, max: number, errors: string[]): number[] {
  if (!Array.isArray(raw) || raw.length !== FORECAST_YEARS) {
    errors.push(`${name} needs exactly ${FORECAST_YEARS} yearly values.`);
    return [];
  }
  raw.forEach((v, i) => {
    if (!finite(v)) errors.push(`${name} year ${i + 1} is not a number.`);
    else if (v < min || v > max) errors.push(`${name} year ${i + 1} is ${pct(v)}, outside ${pct(min)} to ${pct(max)}.`);
  });
  return raw.filter(finite);
}

export type ValidatedScenarios = { ok: true; scenarios: ScenarioAssumptions[]; warnings: string[] } | { ok: false; errors: string[] };

/**
 * Checks the AI's three assumption sets: one each of bear/base/bull, 5-year paths within range, WACC 5-15%,
 * terminal growth below WACC and at most 4%. Unknown evidence ids are dropped with a warning.
 */
export function validateScenarios(raw: unknown, evidenceIds: ReadonlySet<string>): ValidatedScenarios {
  const list = (raw as { scenarios?: unknown } | null)?.scenarios;
  if (!Array.isArray(list)) return { ok: false, errors: ["No scenarios in the AI output."] };
  const errors: string[] = [];
  const warnings: string[] = [];
  const out: ScenarioAssumptions[] = [];
  for (const id of SCENARIO_IDS) {
    const matches = list.filter((s) => (s as { id?: unknown })?.id === id);
    if (matches.length !== 1) {
      errors.push(`Expected one ${id} scenario, got ${matches.length}.`);
      continue;
    }
    const s = matches[0] as Record<string, unknown>;
    const label = SCENARIO_LABEL[id];
    const errs: string[] = [];
    const revenueGrowth = checkPath(`${label} revenue growth`, s.revenueGrowth, LIMITS.growth.min, LIMITS.growth.max, errs);
    const fcfMargin = checkPath(`${label} FCF margin`, s.fcfMargin, LIMITS.margin.min, LIMITS.margin.max, errs);
    const { wacc, terminalGrowth } = s;
    if (!finite(wacc) || wacc < LIMITS.wacc.min || wacc > LIMITS.wacc.max) errs.push(`${label} WACC must be between 5% and 15%.`);
    if (!finite(terminalGrowth) || terminalGrowth > LIMITS.terminalMax) errs.push(`${label} terminal growth must be a number at most 4%.`);
    else if (finite(wacc) && terminalGrowth >= wacc) errs.push(`${label} terminal growth must be below WACC.`);
    const rationale = typeof s.rationale === "string" ? s.rationale.trim() : "";
    if (!rationale) errs.push(`${label} has no rationale.`);
    const refs = Array.isArray(s.evidence) ? s.evidence.filter((e): e is string => typeof e === "string") : [];
    const unique = [...new Set(refs.map((e) => e.trim().toUpperCase()))];
    const known = unique.filter((e) => evidenceIds.has(e));
    if (known.length < unique.length) warnings.push(`${label}: ${unique.length - known.length} unknown evidence reference(s) removed.`);
    if (errs.length) {
      errors.push(...errs);
      continue;
    }
    out.push({ id, revenueGrowth, fcfMargin, terminalGrowth: terminalGrowth as number, wacc: wacc as number, rationale, evidence: known });
  }
  return errors.length ? { ok: false, errors } : { ok: true, scenarios: out, warnings };
}

export function dcfInputsFor(base: DcfBase, a: ScenarioAssumptions): DcfInputs {
  return {
    baseRevenue: base.revenueTTM,
    years: FORECAST_YEARS,
    revenueGrowth: a.revenueGrowth,
    mode: "fcfMargin",
    fcfMargin: a.fcfMargin,
    wacc: a.wacc,
    terminalGrowth: a.terminalGrowth,
    netDebt: base.netDebt,
    sharesDiluted: base.shares,
  };
}

/** Fair value per scenario with runDcf, plus return potential and margin of safety vs `price` (null = no price). */
export function valueScenarios(base: DcfBase, scenarios: readonly ScenarioAssumptions[], price: number | null): ScenarioOutcome[] {
  const p = finite(price) && price > 0 ? price : null;
  return scenarios.map((a) => {
    const r = runDcf(dcfInputsFor(base, a));
    const common = { id: a.id, label: SCENARIO_LABEL[a.id], assumptions: a };
    if (!r.ok) {
      return { ...common, perShare: null, enterpriseValue: null, equityValue: null, terminalShareOfEv: null, returnPotential: null, marginOfSafety: null, errors: r.errors, warnings: [] };
    }
    return {
      ...common,
      perShare: r.perShare,
      enterpriseValue: r.enterpriseValue,
      equityValue: r.equityValue,
      terminalShareOfEv: r.terminalShareOfEv,
      returnPotential: p === null ? null : upside(r.perShare, p),
      marginOfSafety: p === null ? null : marginOfSafety(r.perShare, p),
      errors: [],
      warnings: r.warnings,
    };
  });
}

/** Numbers every claim across the answer's sections as E1, E2... (stable order) for the scenario step. */
export function evidenceFrom(answer: AnalystAnswer): ThesisEvidence[] {
  const out: ThesisEvidence[] = [];
  for (const s of answer.sections) {
    for (const c of s.claims) out.push({ id: `E${out.length + 1}`, kind: c.kind, text: c.text, section: s.heading ?? "", refs: c.refs });
  }
  return out;
}
