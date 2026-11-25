/**
 * Provider responses shaped exactly like the documented examples (FMP stable docs and Finnhub docs,
 * read Nov 2026). The first row of each list is the docs' own example; further rows reuse the same
 * field names with test values so multi-row logic (joins, sorting, monthly trends) can be exercised.
 * Test data only: never imported by app code.
 */

/** https://financialmodelingprep.com/stable/price-target-consensus?symbol=AAPL */
export const FMP_PT_CONSENSUS = [{ symbol: "AAPL", targetHigh: 400, targetLow: 250, targetConsensus: 337.67, targetMedian: 340 }];

/** https://financialmodelingprep.com/stable/price-target-summary?symbol=AAPL */
export const FMP_PT_SUMMARY = [
  {
    symbol: "AAPL",
    lastMonthCount: 8,
    lastMonthAvgPriceTarget: 333.75,
    lastQuarterCount: 20,
    lastQuarterAvgPriceTarget: 332.95,
    lastYearCount: 67,
    lastYearAvgPriceTarget: 304.86,
    allTimeCount: 254,
    allTimeAvgPriceTarget: 230.51,
    publishers:
      '["StreetInsider","TheFly","Benzinga","Pulse 2.0","TipRanks Contributor","MarketWatch","Investing","Barrons","Investor\'s Business Daily"]',
  },
];

/** https://financialmodelingprep.com/stable/grades-consensus?symbol=AAPL */
export const FMP_GRADES_CONSENSUS = [{ symbol: "AAPL", strongBuy: 1, buy: 70, hold: 32, sell: 8, strongSell: 0, consensus: "Buy" }];

/** https://financialmodelingprep.com/stable/grades-historical?symbol=AAPL (newest first, as FMP lists it). */
export const FMP_GRADES_HISTORICAL = [
  { symbol: "AAPL", date: "2026-07-01", analystRatingsStrongBuy: 6, analystRatingsBuy: 23, analystRatingsHold: 17, analystRatingsSell: 2, analystRatingsStrongSell: 2 },
  { symbol: "AAPL", date: "2026-06-01", analystRatingsStrongBuy: 6, analystRatingsBuy: 22, analystRatingsHold: 18, analystRatingsSell: 2, analystRatingsStrongSell: 2 },
  { symbol: "AAPL", date: "2026-05-01", analystRatingsStrongBuy: 5, analystRatingsBuy: 22, analystRatingsHold: 18, analystRatingsSell: 3, analystRatingsStrongSell: 1 },
  { symbol: "AAPL", date: "2026-04-01", analystRatingsStrongBuy: 0, analystRatingsBuy: 0, analystRatingsHold: 0, analystRatingsSell: 0, analystRatingsStrongSell: 0 },
];

/** https://financialmodelingprep.com/stable/grades?symbol=AAPL (newest first). */
export const FMP_GRADES = [
  { symbol: "AAPL", date: "2026-07-23", gradingCompany: "Morgan Stanley", previousGrade: "Overweight", newGrade: "Overweight", action: "maintain" },
  { symbol: "AAPL", date: "2026-07-18", gradingCompany: "D.A. Davidson", previousGrade: "Neutral", newGrade: "Buy", action: "upgrade" },
  { symbol: "AAPL", date: "2026-06-30", gradingCompany: "Jefferies", previousGrade: "Hold", newGrade: "Underperform", action: "downgrade" },
  { symbol: "AAPL", date: "2026-03-02", gradingCompany: "Loop Capital", previousGrade: "", newGrade: "Buy", action: "init" },
  { symbol: "AAPL", date: "2024-01-10", gradingCompany: "Barclays", previousGrade: "Equal Weight", newGrade: "Underweight", action: "downgrade" },
  { symbol: "AAPL", date: "", gradingCompany: "Broken Row", previousGrade: "Buy", newGrade: "Buy", action: "maintain" },
];

/** https://financialmodelingprep.com/stable/price-target-news?symbol=AAPL&page=0&limit=100 */
export const FMP_PT_NEWS = [
  {
    symbol: "AAPL",
    publishedDate: "2026-07-23T10:25:54.000Z",
    newsURL: "https://example.com/aapl-ms",
    newsTitle: "Apple price target raised to $380 from $360 at Morgan Stanley",
    analystName: "Test Analyst A",
    priceTarget: 380,
    adjPriceTarget: 380,
    priceWhenPosted: 338.19,
    newsPublisher: "TheFly",
    newsBaseURL: "thefly.com",
    analystCompany: "Morgan Stanley",
  },
  {
    symbol: "AAPL",
    publishedDate: "2026-07-19T12:00:00.000Z",
    newsURL: "https://example.com/aapl-dad",
    newsTitle: "Apple upgraded to Buy from Neutral at DA Davidson, price target $370",
    analystName: "Test Analyst B",
    priceTarget: 370,
    adjPriceTarget: 370,
    priceWhenPosted: 330.5,
    newsPublisher: "StreetInsider",
    newsBaseURL: "streetinsider.com",
    analystCompany: "DA Davidson",
  },
  {
    symbol: "AAPL",
    publishedDate: "2026-07-10T08:00:00.000Z",
    newsURL: "https://example.com/aapl-wedbush",
    newsTitle: "Apple price target lowered to $350 from $375 at Wedbush",
    analystName: "Test Analyst C",
    priceTarget: 350,
    adjPriceTarget: 350,
    priceWhenPosted: 325,
    newsPublisher: "TheFly",
    newsBaseURL: "thefly.com",
    analystCompany: "Wedbush",
  },
];

/** https://finnhub.io/api/v1/stock/recommendation?symbol=AAPL (newest first). */
export const FINNHUB_RECOMMENDATION = [
  { buy: 24, hold: 7, period: "2026-11-01", sell: 0, strongBuy: 13, strongSell: 0, symbol: "AAPL" },
  { buy: 23, hold: 8, period: "2026-10-01", sell: 1, strongBuy: 12, strongSell: 0, symbol: "AAPL" },
];

export const FETCHED_AT = "2026-11-21T15:00:00.000Z";
