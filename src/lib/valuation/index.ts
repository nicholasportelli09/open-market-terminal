/** Valuation engine: pure math for the Valuation Lab and the Scanner. No React, no network. */
export * from "./types";
export { validateDcfInputs, expandSeries, isFiniteNumber, MIN_YEARS, MAX_YEARS } from "./validate";
export { runDcf, dcfPerShare, TERMINAL_SHARE_WARNING } from "./dcf";
export { impliedGrowth, impliedMargin, impliedWacc, GROWTH_RANGE, MARGIN_RANGE, WACC_RANGE } from "./reverse-dcf";
export type { ImpliedResult, ImpliedSuccess, SearchRange } from "./reverse-dcf";
export { solveMonotonic } from "./solve";
export type { SolveResult, SolveFailure, SolveSuccess } from "./solve";
export { sensitivityGrid, centeredRange, MAX_STEPS_PER_SIDE, MAX_AXIS_LENGTH } from "./sensitivity";
export type { SensitivityAxes, SensitivityGrid, SensitivityResult } from "./sensitivity";
export { runScenarios, WEIGHT_TOLERANCE } from "./scenarios";
export type { Scenario, ScenarioId, ScenarioRun, ScenariosResult, WeightedValue } from "./scenarios";
export { MULTIPLES, computeMultiple, peerStats, impliedPrice, marketCap, enterpriseValue } from "./multiples";
export type { CompanyMetrics, MultipleName, MultipleDef, MultipleResult, PeerStats, ImpliedPrice } from "./multiples";
export { upside, marginOfSafety, capmCostOfEquity, wacc, cagr } from "./metrics";
export type { WaccInputs } from "./metrics";
