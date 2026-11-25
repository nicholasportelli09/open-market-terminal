/**
 * Which FRED series the macro dashboard reads, grouped by request. Every id below was checked
 * against https://fred.stlouisfed.org/graph/fredgraph.csv?id=ID on 2026-11-21 (re-checked 2026-11-22) and had a current
 * observation (daily series within days, weekly NFCI within a week, monthly within two months).
 *
 * Omitted on purpose:
 * - Bank of England Bank Rate: FRED's BOERUKM stops in Jan 2017. SONIA (IUDSOIA, the overnight
 *   rate the Bank Rate steers) is shown instead and labelled as SONIA, not as Bank Rate.
 * - Bank of Japan policy rate: FRED's IRSTCB01JPM156N stops in Dec 2023. The OECD overnight call
 *   rate (IRSTCI01JPM156N, the BoJ's operating target, monthly average) is shown and labelled so.
 * - Swiss National Bank policy rate: no current official-rate series on FRED, so it is left out.
 */

export type Frequency = "Daily" | "Weekly" | "Monthly";

/**
 * How a card reads its series.
 * rate: percent level, changes in bp. spread: percent level shown in bp, changes in bp.
 * level: index or price, changes in %. points: index (NFCI), changes in index points.
 * index: volatility index (VIX), changes in index points.
 * yoy: monthly price index turned into YoY %, changes in percentage points.
 * pp: percent level (unemployment), changes in percentage points. flow: monthly change of a level.
 */
export type CardKind = "rate" | "spread" | "level" | "points" | "index" | "yoy" | "pp" | "flow";

export type SeriesDef = {
  id: string;
  label: string;
  /** One line under the label: what the number is. */
  detail: string;
  kind: CardKind;
  frequency: Frequency;
  decimals?: number;
  /** Unit word for flow / points cards, e.g. "k jobs". */
  unit?: string;
  /** Spreads that can go below zero (curve slopes) show an explicit sign. */
  signed?: boolean;
};

export type GroupId = "central" | "curve" | "real" | "labor" | "credit" | "risk";

export type GroupDef = { id: GroupId; ids: string[]; yearsBack: number };

export const TREASURY_TENORS = [
  { id: "DGS1MO", tenor: "1M", years: 1 / 12 },
  { id: "DGS3MO", tenor: "3M", years: 0.25 },
  { id: "DGS6MO", tenor: "6M", years: 0.5 },
  { id: "DGS1", tenor: "1Y", years: 1 },
  { id: "DGS2", tenor: "2Y", years: 2 },
  { id: "DGS5", tenor: "5Y", years: 5 },
  { id: "DGS7", tenor: "7Y", years: 7 },
  { id: "DGS10", tenor: "10Y", years: 10 },
  { id: "DGS20", tenor: "20Y", years: 20 },
  { id: "DGS30", tenor: "30Y", years: 30 },
] as const;

export const FED_UPPER = "DFEDTARU";
export const FED_LOWER = "DFEDTARL";
export const FED_EFFECTIVE = "DFF";

const BASE: Record<string, SeriesDef> = {
  DFF: { id: "DFF", label: "Fed funds effective", detail: "Overnight rate banks actually pay, daily", kind: "rate", frequency: "Daily" },
  ECBDFR: { id: "ECBDFR", label: "ECB deposit facility", detail: "ECB's main policy rate since 2019", kind: "rate", frequency: "Daily" },
  IUDSOIA: {
    id: "IUDSOIA",
    label: "UK: SONIA",
    detail: "Sterling overnight rate set by Bank Rate; not Bank Rate itself",
    kind: "rate",
    frequency: "Daily",
    decimals: 3,
  },
  IRSTCI01JPM156N: {
    id: "IRSTCI01JPM156N",
    label: "Japan: overnight call rate",
    detail: "Monthly average (OECD), the BoJ's operating target; not the announced target",
    kind: "rate",
    frequency: "Monthly",
    decimals: 3,
  },
  T10Y2Y: { id: "T10Y2Y", label: "10y minus 2y", detail: "Treasury curve slope; below 0 means inverted", kind: "spread", frequency: "Daily", signed: true },
  T10Y3M: { id: "T10Y3M", label: "10y minus 3m", detail: "Slope the Fed's research uses for recession odds", kind: "spread", frequency: "Daily", signed: true },
  DFII5: { id: "DFII5", label: "5y real yield", detail: "5-year TIPS yield, after expected inflation", kind: "rate", frequency: "Daily" },
  DFII10: { id: "DFII10", label: "10y real yield", detail: "10-year TIPS yield, after expected inflation", kind: "rate", frequency: "Daily" },
  T5YIE: { id: "T5YIE", label: "5y breakeven", detail: "Inflation the bond market prices for the next 5 years", kind: "rate", frequency: "Daily" },
  T10YIE: { id: "T10YIE", label: "10y breakeven", detail: "Inflation priced for the next 10 years", kind: "rate", frequency: "Daily" },
  T5YIFR: { id: "T5YIFR", label: "5y5y forward inflation", detail: "Expected inflation 5 to 10 years ahead", kind: "rate", frequency: "Daily" },
  CPIAUCSL: { id: "CPIAUCSL", label: "CPI inflation", detail: "Consumer prices, 12-month change", kind: "yoy", frequency: "Monthly" },
  CPILFESL: { id: "CPILFESL", label: "Core CPI", detail: "CPI excluding food and energy, 12-month change", kind: "yoy", frequency: "Monthly" },
  PCEPILFE: { id: "PCEPILFE", label: "Core PCE", detail: "The Fed's preferred gauge, 12-month change", kind: "yoy", frequency: "Monthly" },
  UNRATE: { id: "UNRATE", label: "Unemployment rate", detail: "Share of the labour force without a job", kind: "pp", frequency: "Monthly", decimals: 1 },
  PAYEMS: { id: "PAYEMS", label: "Payrolls, monthly change", detail: "Non-farm jobs added in the month", kind: "flow", frequency: "Monthly", decimals: 0, unit: "k jobs" },
  BAMLH0A0HYM2: { id: "BAMLH0A0HYM2", label: "High yield spread", detail: "ICE BofA US high yield OAS over Treasuries", kind: "spread", frequency: "Daily" },
  BAMLC0A0CM: { id: "BAMLC0A0CM", label: "Investment grade spread", detail: "ICE BofA US corporate OAS over Treasuries", kind: "spread", frequency: "Daily" },
  NFCI: { id: "NFCI", label: "Financial conditions (NFCI)", detail: "Chicago Fed index; below 0 is looser than average", kind: "points", frequency: "Weekly", decimals: 3 },
  VIXCLS: { id: "VIXCLS", label: "VIX, daily close", detail: "Cboe volatility index close (FRED history)", kind: "index", frequency: "Daily" },
  DTWEXBGS: { id: "DTWEXBGS", label: "Broad dollar index", detail: "Fed trade-weighted dollar vs 26 currencies", kind: "level", frequency: "Daily", decimals: 2 },
};

const TENOR_SERIES = Object.fromEntries(
  TREASURY_TENORS.map((t): [string, SeriesDef] => [
    t.id,
    { id: t.id, label: `${t.tenor} Treasury`, detail: "Constant-maturity yield", kind: "rate", frequency: "Daily" },
  ]),
);

export const SERIES: Readonly<Record<string, SeriesDef>> = {
  ...BASE,
  ...TENOR_SERIES,
  [FED_UPPER]: { id: FED_UPPER, label: "Fed target, upper", detail: "Upper bound of the target range", kind: "rate", frequency: "Daily" },
  [FED_LOWER]: { id: FED_LOWER, label: "Fed target, lower", detail: "Lower bound of the target range", kind: "rate", frequency: "Daily" },
};

/** One /api/fred request per group. Monthly data reaches further back so a 1y change of a YoY rate exists. */
export const GROUPS: readonly GroupDef[] = [
  { id: "central", ids: [FED_UPPER, FED_LOWER, FED_EFFECTIVE, "ECBDFR", "IUDSOIA", "IRSTCI01JPM156N"], yearsBack: 3 },
  { id: "curve", ids: [...TREASURY_TENORS.map((t) => t.id), "T10Y2Y", "T10Y3M"], yearsBack: 2 },
  { id: "real", ids: ["DFII5", "DFII10", "T5YIE", "T10YIE", "T5YIFR"], yearsBack: 2 },
  { id: "labor", ids: ["CPIAUCSL", "CPILFESL", "PCEPILFE", "UNRATE", "PAYEMS"], yearsBack: 4 },
  { id: "credit", ids: ["BAMLH0A0HYM2", "BAMLC0A0CM", "NFCI"], yearsBack: 2 },
  { id: "risk", ids: ["VIXCLS", "DTWEXBGS"], yearsBack: 2 },
];

/** Central banks with no current official-rate series on FRED, and what is shown instead. */
/** FRED's BoE (BOERUKM) and BoJ (IRSTCB01JPM156N) policy-rate series ended in 2017 and 2023; it has no current SNB series. */
export const CENTRAL_BANK_NOTES = ["UK and Japan show market overnight rates (FRED's policy-rate series ended); the SNB is left out (no FRED series)."] as const;

export type LiveKind = "level" | "index";

/** Live CNBC instruments for the cross-asset section. */
export const LIVE: readonly { symbol: string; label: string; detail: string; decimals: number; kind: LiveKind }[] = [
  { symbol: ".VIX", label: "VIX, live", detail: "Expected 30-day S&P 500 volatility", decimals: 2, kind: "index" },
  { symbol: ".DXY", label: "Dollar index (DXY)", detail: "Dollar vs six major currencies", decimals: 2, kind: "level" },
  { symbol: "EUR=", label: "EUR/USD", detail: "Dollars per euro", decimals: 4, kind: "level" },
  { symbol: "JPY=", label: "USD/JPY", detail: "Yen per dollar", decimals: 2, kind: "level" },
  { symbol: "@CL.1", label: "WTI crude oil", detail: "Front-month future, USD per barrel", decimals: 2, kind: "level" },
  { symbol: "@GC.1", label: "Gold", detail: "Front-month future, USD per troy ounce", decimals: 1, kind: "level" },
  { symbol: "@HG.1", label: "Copper", detail: "Front-month future, USD per pound", decimals: 3, kind: "level" },
];

/** Overnight / policy reference rate per currency, from the central bank cards (for the portfolio section). */
export const POLICY_BY_CURRENCY: Readonly<Record<string, { id: string; label: string }>> = {
  USD: { id: "DFF", label: "Fed funds effective" },
  EUR: { id: "ECBDFR", label: "ECB deposit facility" },
  GBP: { id: "IUDSOIA", label: "SONIA" },
  JPY: { id: "IRSTCI01JPM156N", label: "Japan overnight call rate, monthly average" },
};

export function fredSeriesPage(id: string): string {
  return `https://fred.stlouisfed.org/series/${id}`;
}
