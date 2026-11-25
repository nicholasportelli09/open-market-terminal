import { expect, test } from "@playwright/test";
import { matchAsiaListings } from "@/lib/asia-listings";
import { intradayBars, isKrSymbol, krMarketStatus, nyWallSeconds, periodBars, toKrQuote } from "@/lib/server/naver";
import { codeCandidates, isSecondaryListing, mergeResults, splitExchangePrefix } from "@/lib/server/symbol-search";
import { stockAnalysisUrl } from "@/lib/stockanalysis";
import { krxSession } from "@/lib/world-sessions";
import { priceFeedOf, priceFeedUrl } from "@/lib/provenance";
import type { SearchResult } from "@/lib/types";

test("Naver realtime entry -> Quote: signed change from the direction, English name, KRW", () => {
  const q = toKrQuote({
    itemCode: "000660",
    stockName: "SK하이닉스",
    closePriceRaw: "1142000",
    compareToPreviousClosePriceRaw: "57000",
    fluctuationsRatioRaw: "5.25",
    compareToPreviousPrice: { name: "RISING" },
    stockExchangeType: { name: "KOSPI" },
    localTradedAt: "2026-11-24T17:34:37.093032+09:00",
    marketStatusDetailType: "OPEN",
    marketSessionType: "afterMarket",
  });
  expect(q).toMatchObject({ symbol: "000660-KR", name: "SK hynix", currency: "KRW", exchange: "KOSPI", country: "KR", last: 1142000, change: 57000, prevClose: 1085000, source: "naver" });
  expect(q?.time).toBe("2026-11-24T17:34:37.093+09:00");
  const down = toKrQuote({ itemCode: "123456", stockName: "테스트", closePriceRaw: "900", compareToPreviousClosePriceRaw: "100", fluctuationsRatioRaw: "10", compareToPreviousPrice: { name: "FALLING" } });
  expect(down).toMatchObject({ name: "테스트", change: -100, changePct: -10, prevClose: 1000 });
  expect(toKrQuote({ itemCode: "123456" })).toBeNull();
});

test("Korean bars: KRX + Nextrade trading day in New York wall-clock time; daily bars at 00:00 UTC of the date", () => {
  const rows = [
    { localDateTime: "20261124075900", currentPrice: 1, openPrice: 1, highPrice: 1, lowPrice: 1 },
    { localDateTime: "20261124090000", currentPrice: 10, openPrice: 9, highPrice: 11, lowPrice: 8, accumulatedTradingVolume: 5 },
    { localDateTime: "20261124173000", currentPrice: 12 },
    { localDateTime: "20261124200100", currentPrice: 13 },
  ];
  const bars = intradayBars(rows);
  expect(bars.map((b) => b.c)).toEqual([10, 12]);
  // 09:00 KST on Nov 24 = 00:00 UTC = 19:00 EST on Nov 23.
  expect(bars[0]).toEqual({ t: Date.UTC(2026, 10, 23, 19, 0) / 1000, o: 9, h: 11, l: 8, c: 10, v: 5 });
  expect(nyWallSeconds(Date.UTC(2026, 6, 1, 12, 0))).toBe(Date.UTC(2026, 6, 1, 8, 0) / 1000); // EDT
  expect(periodBars([{ localDate: "20261120", closePrice: 5, openPrice: 4, highPrice: 6, lowPrice: 3 }])[0].t).toBe(Date.UTC(2026, 10, 20) / 1000);
  expect(isKrSymbol("005930-KR")).toBe(true);
  expect(isKrSymbol("AAPL")).toBe(false);
});

test("Korean quote during Nextrade after-hours: Naver's after-hours price, integrated day range, post session", () => {
  const q = toKrQuote({
    itemCode: "000660",
    closePriceRaw: "1126000",
    compareToPreviousClosePriceRaw: "41000",
    compareToPreviousPrice: { name: "RISING" },
    openPriceRaw: "1212000",
    overMarketPriceInfo: {
      overMarketStatus: "OPEN",
      overPrice: "1,125,000",
      compareToPreviousClosePrice: "40,000",
      fluctuationsRatio: "3.69",
      compareToPreviousPrice: { name: "RISING" },
      localTradedAt: "2026-11-24T18:49:59.761+09:00",
    },
    integratedPriceInfo: { openPrice: "1,180,000", highPrice: "1,233,000", lowPrice: "1,120,000", accumulatedTradingVolume: "6,130,831" },
  });
  expect(q).toMatchObject({ last: 1125000, change: 40000, changePct: 3.69, prevClose: 1085000, open: 1180000, high: 1233000, low: 1120000, volume: 6130831 });
  const at = (iso: string) => new Date(iso);
  // Live after-market: the poll stamp is a fair "as of"; closed: no clock time is invented.
  expect(toKrQuote({ itemCode: "000660", closePriceRaw: "1", marketStatusDetailType: "OPEN", marketSessionType: "afterMarket", localTradedAt: "2026-11-24T18:49:59+09:00" })?.time).toBe("2026-11-24T18:49:59+09:00");
  expect(toKrQuote({ itemCode: "069500", closePriceRaw: "1", marketStatusDetailType: "CLOSE", localTradedAt: "2026-11-24T18:49:59+09:00" }, "ETF")).toMatchObject({ time: null, type: "ETF", marketStatus: "CLOSED" });
  expect(krMarketStatus({ marketStatusDetailType: "OPEN", marketSessionType: "afterMarket" })).toBe("POST");
  expect(krMarketStatus({ marketStatusDetailType: "OPEN", marketSessionType: "regularMarket" })).toBe("REGULAR");
  expect(krMarketStatus({ marketStatusDetailType: "CLOSE", marketSessionType: "afterMarket" })).toBe("CLOSED");
  expect(krxSession("POST", at("2026-11-24T18:50:00+09:00"))).toBe("post");
  expect(krxSession("REGULAR", at("2026-11-24T10:01:00+09:00"))).toBe("regular");
  // A weekday holiday: Naver says closed, so closed during normal hours.
  expect(krxSession("CLOSED", at("2026-12-25T10:00:00+09:00"))).toBe("closed");
  // A stale "open" after 20:00 Seoul or at a weekend still reads closed.
  expect(krxSession("POST", at("2026-11-24T21:00:00+09:00"))).toBe("closed");
  expect(krxSession("REGULAR", at("2026-11-28T10:00:00+09:00"))).toBe("closed");
});

test("English names find home listings that CNBC's short result list misses", () => {
  const top = (q: string) => matchAsiaListings(q).map((m) => m.listing.symbol);
  expect(top("sk hynix")[0]).toBe("000660-KR");
  expect(top("softbank")).toEqual(expect.arrayContaining(["9984.T-JP", "9434.T-JP"]));
  expect(top("samsung electronics")[0]).toBe("005930-KR");
  expect(top("foxconn")[0]).toBe("2317-TW");
  expect(matchAsiaListings("bank")[0]).toMatchObject({ score: 2, listing: { name: "Bank of China (Hong Kong)" } });
  expect(matchAsiaListings("x")).toEqual([]);
});

test("search ranking: exact ticker, codes, strong Asian name matches, then CNBC home listings ahead of weak matches and copies", () => {
  const r = (symbol: string, exchange: string): SearchResult => ({ symbol, name: symbol, type: "STOCK", exchange });
  const merged = mergeResults("byd", {
    code: [],
    curated: [{ result: r("1211-HK", "Hong Kong Stock Exchange"), score: 3 }],
    korea: [],
    cnbc: [r("BY6-FF", "Frankfurt Stock Exchange"), r("BYD", "NYSE"), r("BYDDF", "OTCPK"), r("1211-HK", "Hong Kong Stock Exchange")],
  });
  expect(merged.map((x) => x.symbol)).toEqual(["BYD", "1211-HK", "BY6-FF", "BYDDF"]);
  // "bank": weak (later-word) Asian matches and Naver's Korean ETFs go after CNBC's home listings.
  const bank = mergeResults("bank", {
    code: [],
    curated: [{ result: r("600036-CN", "Shanghai Stock Exchange"), score: 1 }],
    korea: [r("111111-KR", "KOSPI"), r("222222-KR", "KOSPI"), r("333333-KR", "KOSPI"), r("444444-KR", "KOSPI")],
    cnbc: [r("BAC", "NYSE"), r("BK", "NYSE")],
  });
  expect(bank.map((x) => x.symbol)).toEqual(["BAC", "BK", "600036-CN", "111111-KR", "222222-KR", "333333-KR"]);
  // A short common word that only prefixes an Asian name keeps CNBC's order.
  const delta = mergeResults("delta", { code: [], curated: [{ result: r("2308-TW", "Taiwan Stock Exchange"), score: 2 }], korea: [], cnbc: [r("DAL", "NYSE")] });
  expect(delta.map((x) => x.symbol)).toEqual(["DAL", "2308-TW"]);
  // Korean script: Naver's rows lead.
  const ko = mergeResults("삼성", { code: [], curated: [], korea: [r("005930-KR", "KOSPI")], cnbc: [r("SSNLF", "OTCPK"), r("SMSN-GB", "London Stock Exchange")] });
  expect(ko[0].symbol).toBe("005930-KR");
  expect(isSecondaryListing(r("0L7L-GB", "London Stock Exchange"))).toBe(true);
  expect(isSecondaryListing(r("HSBA-GB", "London Stock Exchange"))).toBe(false);
  expect(isSecondaryListing(r("SKHY3'-BR", "Sao Paulo Stock Exchange"))).toBe(true);
  expect(codeCandidates("9984")).toEqual(["9984.T-JP", "9984-TW", "9984-HK"]);
  expect(codeCandidates("000660")).toEqual(["000660-KR", "000660-CN"]);
  expect(codeCandidates("0700")).toContain("700-HK");
  expect(codeCandidates("apple")).toEqual([]);
});

test("stockanalysis.com links per exchange; none for indices or FX", () => {
  const u = (symbol: string, exchange: string, country: string, type = "STOCK") => stockAnalysisUrl({ symbol, exchange, country, type });
  expect(u("AAPL", "NASDAQ", "US")).toBe("https://stockanalysis.com/stocks/aapl/");
  expect(u("SOBKY", "OTCQB", "US")).toBe("https://stockanalysis.com/quote/otc/SOBKY/");
  expect(u("9984.T-JP", "Tokyo Stock Exchange", "JP")).toBe("https://stockanalysis.com/quote/tyo/9984/");
  expect(u("000660-KR", "KOSPI", "KR")).toBe("https://stockanalysis.com/quote/krx/000660/");
  expect(u("247540-KR", "KOSDAQ", "KR")).toBe("https://stockanalysis.com/quote/kosdaq/247540/");
  expect(u("700-HK", "Hong Kong Stock Exchange", "HK")).toBe("https://stockanalysis.com/quote/hkg/0700/");
  expect(u("600519-CN", "Shanghai Stock Exchange", "CN")).toBe("https://stockanalysis.com/quote/sha/600519/");
  expect(u("002594-CN", "Shenzhen Stock Exchange", "CN")).toBe("https://stockanalysis.com/quote/she/002594/");
  expect(u("2330-TW", "Taiwan Stock Exchange", "TW")).toBe("https://stockanalysis.com/quote/tpe/2330/");
  expect(u("SAP-DE", "XETRA", "DE")).toBe("https://stockanalysis.com/quote/etr/SAP/");
  expect(u("HSBA-GB", "London Stock Exchange", "GB")).toBe("https://stockanalysis.com/quote/lon/HSBA/");
  expect(u("XYZ-ZZ", "Somewhere", "ZZ")).toBe("https://stockanalysis.com/symbol-lookup/?q=XYZ");
  expect(u("VFIAX", "NASDAQ", "US", "FUND")).toBe("https://stockanalysis.com/quote/mutf/VFIAX/");
  expect(u("BP.-GB", "London Stock Exchange", "GB")).toBe("https://stockanalysis.com/quote/lon/BP/");
  expect(u("BT.A-GB", "London Stock Exchange", "GB")).toBe("https://stockanalysis.com/quote/lon/BT.A/");
  expect(u("DBSM-SG", "Singapore Exchange", "SG")).toBe("https://stockanalysis.com/symbol-lookup/?q=DBSM");
  expect(u("D05-SG", "Singapore Exchange", "SG")).toBe("https://stockanalysis.com/quote/sgx/D05/");
  expect(u("VALE-BR", "Sao Paulo Stock Exchange", "BR")).toBe("https://stockanalysis.com/symbol-lookup/?q=VALE");
  expect(u("PETR4-BR", "Sao Paulo Stock Exchange", "BR")).toBe("https://stockanalysis.com/quote/bvmf/PETR4/");
  expect(u("530031-KR", "KOSPI", "KR", "ETN")).toBeNull();
  expect(u("069500-KR", "KOSPI", "KR", "ETF")).toBe("https://stockanalysis.com/symbol-lookup/?q=069500");
  expect(priceFeedOf("005930-KR")).toBe("naver");
  expect(priceFeedUrl("005930-KR")).toBe("https://finance.naver.com/item/main.naver?code=005930");
  expect(priceFeedUrl("AAPL")).toBe("https://www.cnbc.com/quotes/AAPL");
  expect(u(".SPX", "", "US", "INDEX")).toBeNull();
  expect(u("EUR=", "", "", "CURRENCY")).toBeNull();
});

test("names typed without spaces and exchange prefixes find the home listing", () => {
  expect(matchAsiaListings("skhynix")[0]).toMatchObject({ listing: { symbol: "000660-KR" }, score: 3 });
  expect(matchAsiaListings("softbankgr")[0]?.listing.symbol).toBe("9984.T-JP");
  expect(splitExchangePrefix("KRX: 000660")).toEqual({ code: "000660", symbol: "000660-KR" });
  expect(splitExchangePrefix("kosdaq:247540")).toEqual({ code: "247540", symbol: "247540-KR" });
  expect(splitExchangePrefix("TYO:9984")).toEqual({ code: "9984", symbol: "9984.T-JP" });
  expect(splitExchangePrefix("HKG: 0700")).toEqual({ code: "0700", symbol: "700-HK" });
  expect(splitExchangePrefix("SHA:600519")).toEqual({ code: "600519", symbol: "600519-CN" });
  expect(splitExchangePrefix("NASDAQ: aapl")).toEqual({ code: "AAPL", symbol: null });
  expect(splitExchangePrefix("sk hynix")).toBeNull();
  expect(splitExchangePrefix("foo: bar")).toBeNull();
});
