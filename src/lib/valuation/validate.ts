import type { DcfInputs, Validation } from "./types";

export const MIN_YEARS = 3;
export const MAX_YEARS = 15;

export function isFiniteNumber(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x);
}

/**
 * Per-year series for `years` years: shorter arrays repeat their last value, longer arrays are cut.
 * Callers must validate first (an empty array has no last value).
 */
export function expandSeries(values: readonly number[], years: number): number[] {
  const last = values[values.length - 1];
  return Array.from({ length: years }, (_, i) => (i < values.length ? values[i] : last));
}

function checkSeries(
  errors: string[],
  name: string,
  values: unknown,
  check: (v: number) => boolean,
  rule: string,
): void {
  if (!Array.isArray(values) || values.length === 0) {
    errors.push(`${name} needs at least one value.`);
    return;
  }
  values.forEach((v, i) => {
    if (!isFiniteNumber(v)) errors.push(`${name}[${i}] must be a finite number.`);
    else if (!check(v)) errors.push(`${name}[${i}] ${rule} (got ${v}).`);
  });
}

const inMarginRange = (v: number) => v >= -1 && v <= 1;

function checkModeInputs(inputs: DcfInputs, errors: string[]): void {
  if (inputs.mode === "fcfMargin") {
    checkSeries(errors, "fcfMargin", inputs.fcfMargin, inMarginRange, "must be between -1 and 1");
    return;
  }
  if (inputs.mode !== "fundamental") {
    errors.push(`mode must be "fcfMargin" or "fundamental".`);
    return;
  }
  checkSeries(errors, "ebitMargin", inputs.ebitMargin, inMarginRange, "must be between -1 and 1");
  if (!isFiniteNumber(inputs.taxRate)) errors.push("taxRate must be a finite number (fundamental mode).");
  else if (inputs.taxRate < 0 || inputs.taxRate > 1) errors.push(`taxRate must be between 0 and 1 (got ${inputs.taxRate}).`);
  if (!isFiniteNumber(inputs.salesToCapital)) errors.push("salesToCapital must be a finite number (fundamental mode).");
  else if (inputs.salesToCapital <= 0) errors.push(`salesToCapital must be greater than 0 (got ${inputs.salesToCapital}).`);
}

function checkRates(inputs: DcfInputs, errors: string[]): void {
  const { wacc, terminalGrowth } = inputs;
  const waccOk = isFiniteNumber(wacc);
  const gOk = isFiniteNumber(terminalGrowth);
  if (!waccOk) errors.push("wacc must be a finite number.");
  else if (wacc <= 0 || wacc > 1) errors.push(`wacc must be greater than 0 and at most 1 (got ${wacc}).`);
  if (!gOk) errors.push("terminalGrowth must be a finite number.");
  else if (terminalGrowth <= -1) errors.push(`terminalGrowth must be greater than -1 (got ${terminalGrowth}).`);
  if (waccOk && gOk && wacc <= terminalGrowth) {
    errors.push(`wacc (${wacc}) must be greater than terminalGrowth (${terminalGrowth}); the Gordon formula is undefined otherwise.`);
  }
}

/** Checks every DCF input. Never throws; returns all problems at once. */
export function validateDcfInputs(inputs: DcfInputs): Validation {
  const errors: string[] = [];
  if (inputs === null || typeof inputs !== "object") return { ok: false, errors: ["inputs are missing."] };

  if (!isFiniteNumber(inputs.baseRevenue)) errors.push("baseRevenue must be a finite number.");
  else if (inputs.baseRevenue <= 0) errors.push(`baseRevenue must be greater than 0 (got ${inputs.baseRevenue}).`);

  if (!isFiniteNumber(inputs.years) || !Number.isInteger(inputs.years) || inputs.years < MIN_YEARS || inputs.years > MAX_YEARS) {
    errors.push(`years must be a whole number from ${MIN_YEARS} to ${MAX_YEARS} (got ${inputs.years}).`);
  }

  checkSeries(errors, "revenueGrowth", inputs.revenueGrowth, (v) => v >= -1, "must be -1 or more");
  checkModeInputs(inputs, errors);
  checkRates(inputs, errors);

  if (!isFiniteNumber(inputs.netDebt)) errors.push("netDebt must be a finite number.");
  if (!isFiniteNumber(inputs.sharesDiluted)) errors.push("sharesDiluted must be a finite number.");
  else if (inputs.sharesDiluted <= 0) errors.push(`sharesDiluted must be greater than 0 (got ${inputs.sharesDiluted}).`);
  if (inputs.otherAdjustments !== undefined && !isFiniteNumber(inputs.otherAdjustments)) {
    errors.push("otherAdjustments must be a finite number when given.");
  }
  if (inputs.midYear !== undefined && typeof inputs.midYear !== "boolean") errors.push("midYear must be true or false.");

  return errors.length ? { ok: false, errors } : { ok: true };
}
