export type MarketTab = { id: string; label: string; symbols: string[] };

export const MARKET_TABS: MarketTab[] = [
  { id: "us", label: "US", symbols: [".SPX", ".IXIC", ".DJI", ".RUT", ".VIX"] },
  { id: "europe", label: "Europe", symbols: [".STOXX", ".GDAXI", ".FTSE", ".FCHI", ".SSMI"] },
  { id: "asia", label: "Asia", symbols: [".N225", ".HSI", ".SSEC", ".KS11", ".NSEI"] },
  { id: "rates", label: "Rates", symbols: ["US2Y", "US10Y", "US30Y", "DE10Y-DE", "JP10Y-JP"] },
  { id: "fx", label: "Currencies", symbols: [".DXY", "EUR=", "JPY=", "GBP=", "CHF="] },
  { id: "commodities", label: "Commodities", symbols: ["@CL.1", "@LCO.1", "@GC.1", "@SI.1", "@NG.1"] },
  { id: "crypto", label: "Crypto", symbols: ["BTC.CM=", "ETH.CM=", "SOL.CM=", "XRP.CM="] },
];

export const TAPE = [".SPX", ".IXIC", ".DJI", ".VIX", "US10Y", ".DXY", "EUR=", "@CL.1", "@GC.1", "BTC.CM="];

export const YIELD_CURVE: { symbol: string; tenor: string; years: number }[] = [
  { symbol: "US1M", tenor: "1M", years: 1 / 12 },
  { symbol: "US3M", tenor: "3M", years: 0.25 },
  { symbol: "US6M", tenor: "6M", years: 0.5 },
  { symbol: "US1Y", tenor: "1Y", years: 1 },
  { symbol: "US2Y", tenor: "2Y", years: 2 },
  { symbol: "US5Y", tenor: "5Y", years: 5 },
  { symbol: "US10Y", tenor: "10Y", years: 10 },
  { symbol: "US20Y", tenor: "20Y", years: 20 },
  { symbol: "US30Y", tenor: "30Y", years: 30 },
];

export const SECTORS: { symbol: string; label: string }[] = [
  { symbol: "XLK", label: "Technology" },
  { symbol: "XLC", label: "Communication" },
  { symbol: "XLY", label: "Cons. Discretionary" },
  { symbol: "XLF", label: "Financials" },
  { symbol: "XLV", label: "Health Care" },
  { symbol: "XLI", label: "Industrials" },
  { symbol: "XLE", label: "Energy" },
  { symbol: "XLP", label: "Cons. Staples" },
  { symbol: "XLB", label: "Materials" },
  { symbol: "XLU", label: "Utilities" },
  { symbol: "XLRE", label: "Real Estate" },
];

/** Large-cap US universe used to compute movers. */
export const MOVERS_UNIVERSE = [
  "AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA", "AVGO", "BRK.B", "JPM", "LLY", "V", "UNH",
  "XOM", "MA", "COST", "HD", "PG", "JNJ", "NFLX", "ABBV", "WMT", "BAC", "CRM", "ORCL", "AMD", "KO",
  "PEP", "CVX", "MRK", "ADBE", "TMO", "CSCO", "INTC", "DIS", "MCD", "QCOM", "IBM", "GS", "PLTR",
  "UBER", "COIN", "MU", "NKE", "BA", "PFE", "T", "VZ", "SBUX", "ABNB",
];

export const DEFAULT_WATCHLIST = ["AAPL", "NVDA", "MSFT", "TSLA", "AMZN", "GOOGL", "META", "@GC.1", "BTC.CM="];

const SHORT_NAMES: Record<string, string> = {
  ".SPX": "S&P 500",
  ".IXIC": "Nasdaq",
  ".NDX": "Nasdaq 100",
  ".DJI": "Dow Jones",
  ".RUT": "Russell 2000",
  ".VIX": "VIX",
  ".STOXX": "STOXX 600",
  ".GDAXI": "DAX",
  ".FTSE": "FTSE 100",
  ".FCHI": "CAC 40",
  ".SSMI": "SMI",
  ".N225": "Nikkei 225",
  ".HSI": "Hang Seng",
  ".SSEC": "Shanghai",
  ".KS11": "KOSPI",
  ".NSEI": "Nifty 50",
  ".DXY": "Dollar Index",
  "EUR=": "EUR/USD",
  "JPY=": "USD/JPY",
  "GBP=": "GBP/USD",
  "CHF=": "USD/CHF",
  "@CL.1": "WTI Crude",
  "@LCO.1": "Brent Crude",
  "@GC.1": "Gold",
  "@SI.1": "Silver",
  "@NG.1": "Natural Gas",
  "@HG.1": "Copper",
  "BTC.CM=": "Bitcoin",
  "ETH.CM=": "Ether",
  "SOL.CM=": "Solana",
  "XRP.CM=": "XRP",
  US1M: "US 1M",
  US3M: "US 3M",
  US6M: "US 6M",
  US1Y: "US 1Y",
  US2Y: "US 2Y",
  US5Y: "US 5Y",
  US10Y: "US 10Y",
  US20Y: "US 20Y",
  US30Y: "US 30Y",
  "DE10Y-DE": "Bund 10Y",
  "JP10Y-JP": "JGB 10Y",
  "GB10Y-GB": "Gilt 10Y",
};

const DISPLAY_TICKERS: Record<string, string> = {
  ".SPX": "SPX",
  ".IXIC": "COMP",
  ".DJI": "INDU",
  ".DXY": "DXY",
  "EUR=": "EURUSD",
  "JPY=": "USDJPY",
  "GBP=": "GBPUSD",
  "CHF=": "USDCHF",
  "@CL.1": "CL1",
  "@LCO.1": "CO1",
  "@GC.1": "GC1",
  "@SI.1": "SI1",
  "@NG.1": "NG1",
  "BTC.CM=": "BTC",
  "ETH.CM=": "ETH",
  "SOL.CM=": "SOL",
  "XRP.CM=": "XRP",
};

export function shortName(symbol: string, fallback?: string): string {
  return SHORT_NAMES[symbol] ?? fallback ?? symbol;
}

export function displayTicker(symbol: string): string {
  return DISPLAY_TICKERS[symbol] ?? symbol.replace(/^\./, "").replace(/-[A-Z]{2}$/, "");
}

export function hasShortName(symbol: string): boolean {
  return symbol in SHORT_NAMES;
}

export function quoteHref(symbol: string): string {
  return `/q/${encodeURIComponent(symbol)}`;
}
