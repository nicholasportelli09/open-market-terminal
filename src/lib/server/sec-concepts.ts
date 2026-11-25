/** us-gaap concept fallbacks, in priority order. The first concept with data for the period wins. */
export const FLOW_CONCEPTS = {
  revenue: [
    "Revenues",
    "RevenueFromContractWithCustomerExcludingAssessedTax",
    "SalesRevenueNet",
    "RevenueFromContractWithCustomerIncludingAssessedTax",
    // Banks report revenue net of interest expense.
    "RevenuesNetOfInterestExpense",
  ],
  grossProfit: ["GrossProfit"],
  costOfRevenue: ["CostOfRevenue", "CostOfGoodsAndServicesSold", "CostOfGoodsSold"],
  operatingIncome: ["OperatingIncomeLoss"],
  netIncome: ["NetIncomeLoss", "NetIncomeLossAvailableToCommonStockholdersBasic"],
  epsDiluted: ["EarningsPerShareDiluted"],
  operatingCashFlow: [
    "NetCashProvidedByUsedInOperatingActivities",
    "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations",
  ],
  capex: ["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsToAcquireProductiveAssets"],
  depreciationAmortization: [
    "DepreciationDepletionAndAmortization",
    "DepreciationAndAmortization",
    "DepreciationAmortizationAndAccretionNet",
  ],
  interestExpense: ["InterestExpenseNonoperating", "InterestExpense", "InterestExpenseDebt"],
  incomeTax: ["IncomeTaxExpenseBenefit"],
  pretaxIncome: [
    "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest",
    "IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments",
  ],
} as const;

export type FlowKey = keyof typeof FLOW_CONCEPTS;

export const INSTANT_CONCEPTS = {
  equity: ["StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"],
  cash: ["CashAndCashEquivalentsAtCarryingValue", "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents", "Cash"],
  shortTermInvestments: [
    "MarketableSecuritiesCurrent",
    "ShortTermInvestments",
    "AvailableForSaleSecuritiesDebtSecuritiesCurrent",
    "DebtSecuritiesCurrent",
  ],
  /** Total long-term debt including its current portion. */
  longTermDebtTotal: ["LongTermDebt"],
  longTermDebtNoncurrent: ["LongTermDebtNoncurrent", "LongTermDebtAndCapitalLeaseObligations"],
  longTermDebtCurrent: ["LongTermDebtCurrent", "LongTermDebtAndCapitalLeaseObligationsCurrent"],
  shortTermDebt: ["CommercialPaper", "ShortTermBorrowings"],
} as const;

export type InstantKey = keyof typeof INSTANT_CONCEPTS;

/** Concepts used to detect the reporting currency (the unit most of them use). */
export const CURRENCY_PROBES = ["NetIncomeLoss", "StockholdersEquity", "Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "Assets"];

const KEPT_GAAP = new Set<string>([
  ...Object.values(FLOW_CONCEPTS).flat(),
  ...Object.values(INSTANT_CONCEPTS).flat(),
  ...CURRENCY_PROBES,
  "WeightedAverageNumberOfDilutedSharesOutstanding",
]);
const KEPT_DEI = new Set(["EntityCommonStockSharesOutstanding"]);

type FactsLike = {
  cik: number | string;
  entityName: string;
  facts: Record<string, Record<string, unknown> | undefined>;
  latestEnds?: Record<string, string>;
};

/** Latest period end of any fact in one taxonomy, or null. Works on raw (untrimmed) concepts. */
export function scanLatestEnd(concepts: Record<string, unknown> | undefined): string | null {
  let best = "";
  for (const concept of Object.values(concepts ?? {})) {
    const units = (concept as { units?: Record<string, unknown> } | null)?.units ?? {};
    for (const list of Object.values(units)) {
      if (!Array.isArray(list)) continue;
      for (const p of list) {
        const end = (p as { end?: unknown } | null)?.end;
        if (typeof end === "string" && end > best) best = end;
      }
    }
  }
  return best || null;
}

/**
 * Keeps only the concepts the snapshot uses (companyfacts is 1-10 MB per company). Other taxonomies
 * (e.g. ifrs-full) are kept as empty objects so "which taxonomy does this filer use" still works, and
 * the latest period end of every taxonomy is recorded first (`latestEnds`), so a filer that moved from
 * US GAAP to IFRS can still be told apart from a current US GAAP filer.
 */
export function trimFacts<T extends FactsLike>(raw: T): T {
  const facts: Record<string, Record<string, unknown>> = {};
  const latestEnds: Record<string, string> = { ...(raw.latestEnds ?? {}) };
  for (const [taxonomy, concepts] of Object.entries(raw.facts ?? {})) {
    const end = scanLatestEnd(concepts);
    if (end && !(latestEnds[taxonomy] > end)) latestEnds[taxonomy] = end;
    const keep = taxonomy === "us-gaap" ? KEPT_GAAP : taxonomy === "dei" ? KEPT_DEI : null;
    facts[taxonomy] = keep && concepts ? Object.fromEntries(Object.entries(concepts).filter(([k]) => keep.has(k))) : {};
  }
  return { ...raw, facts, latestEnds };
}
