import { expect, test } from "@playwright/test";
import { MAX_EXTRA_TICKERS, SHARE_CLASS_PAIRS, SP100, cleanExtras, normalizeTicker } from "@/lib/scanner/universe";
import { sectorFor, sectorFromSic } from "@/lib/scanner/sectors";
import { parsePrefs, parseTheses } from "@/lib/scanner/storage";
import { parseCnbcDate, quoteCatalysts, recent8ks, catalystMetrics } from "@/lib/server/scanner/catalysts";
import { annualisedVolatility, maxDrawdown } from "@/lib/server/scanner/risk";
import { checkPe, parseCnbcNumber } from "@/lib/server/scanner/checks";
import { DEFAULT_WEIGHTS } from "@/lib/scanner/factors";

test.describe("universe", () => {
  test("S&P 100: 100 unique companies (101 tickers, Alphabet in both classes)", () => {
    expect(new Set(SP100).size).toBe(SP100.length);
    expect(SP100).toHaveLength(101);
    const companies = new Set(SP100.map((t) => SHARE_CLASS_PAIRS[t] ?? t));
    expect(companies.size).toBe(100);
    expect(SP100).toEqual([...SP100].sort());
    for (const t of SP100) expect(normalizeTicker(t)).toBe(t);
  });

  test("extras are validated, de-duplicated, outside the index and capped", () => {
    expect(normalizeTicker(" brk-b ")).toBe("BRK.B");
    expect(normalizeTicker("TOOLONG")).toBeNull();
    expect(normalizeTicker("1234")).toBeNull();
    expect(cleanExtras(["shop", "SHOP", "AAPL", "bad!", "crwd"])).toEqual(["SHOP", "CRWD"]);
    const many = Array.from({ length: 30 }, (_, i) => `Z${String.fromCharCode(65 + (i % 26))}${String.fromCharCode(65 + Math.floor(i / 26))}`);
    expect(cleanExtras(many)).toHaveLength(MAX_EXTRA_TICKERS);
  });

  test("sectors from SIC", () => {
    expect(sectorFromSic("3571")).toBe("Technology hardware");
    expect(sectorFromSic("6021")).toBe("Financials");
    expect(sectorFromSic("6798")).toBe("Real estate");
    expect(sectorFromSic("2834")).toBe("Health care");
    expect(sectorFromSic("7990")).toBe("Telecom and media");
    expect(sectorFromSic(null)).toBe("Unclassified");
    expect(sectorFromSic("3826")).toBe("Health care");
    expect(sectorFor("TMO", "3829")).toBe("Health care");
    expect(sectorFor("DHR", "3823")).toBe("Health care");
    expect(sectorFor("XYZ", "3829")).toBe("Technology hardware");
  });
});

test.describe("stored data is validated", () => {
  test("prefs", () => {
    expect(parsePrefs({ version: 1, extras: ["shop", "AAPL", 3], weights: { value: 50 } })).toEqual({ extras: ["SHOP"], weights: { ...DEFAULT_WEIGHTS, value: 50 } });
    expect(parsePrefs({ version: 2, extras: ["SHOP"] }).extras).toEqual([]);
    expect(parsePrefs("garbage").weights).toEqual(DEFAULT_WEIGHTS);
  });

  test("theses ignore bad entries", () => {
    const good = { symbol: "AAPL", name: "Apple", generatedAt: "2026-11-22T00:00:00Z", answer: { sections: [], citations: [] }, scenarios: null, warnings: [] };
    expect(parseTheses({ version: 1, theses: [good, { symbol: 1 }, null] })).toHaveLength(1);
    expect(parseTheses({ theses: [good] })).toEqual([]);
  });
});

test.describe("catalyst and risk inputs", () => {
  const prov = { source: "cnbc" as const, asOf: "2026-11-22T00:00:00Z" };

  test("CNBC event dates", () => {
    expect(parseCnbcDate("01/27/2027(est)")).toEqual({ date: "2027-01-27", estimated: true });
    expect(parseCnbcDate("11/12/2026")).toEqual({ date: "2026-11-12", estimated: false });
    expect(parseCnbcDate("")).toBeNull();
    const cats = quoteCatalysts({ next_earnings_date: "12/10/2026", announce_time: "A", div_ex_date: "11/12/2026" }, "2026-11-22", prov);
    expect(cats.map((c) => c.kind)).toEqual(["earnings"]); // past ex-dividend dropped
    expect(cats[0].detail).toBe("after the close");
  });

  test("8-Ks in the last 30 days and the catalyst metrics", () => {
    const filings = [
      { form: "8-K", filingDate: "2026-11-20", accessionNumber: "0001-26-1", primaryDocument: "a.htm", items: "2.02,9.01" },
      { form: "8-K", filingDate: "2026-10-01", accessionNumber: "0001-26-2", primaryDocument: "b.htm", items: "8.01" },
      { form: "10-Q", filingDate: "2026-11-01", accessionNumber: "0001-26-3", primaryDocument: "c.htm", items: "" },
    ];
    const k = recent8ks(filings, "0000320193", "2026-11-22");
    expect(k).toHaveLength(1);
    expect(k[0].detail).toBe("Results of operations");
    expect(k[0].provenance.url).toBe("https://www.sec.gov/Archives/edgar/data/320193/0001261/a.htm");
    const earnings = quoteCatalysts({ next_earnings_date: "12/10/2026" }, "2026-11-22", prov);
    const m = catalystMetrics([...earnings, ...k], "2026-11-22", prov, { source: "sec", asOf: "2026-11-22" });
    expect(m.earningsWithin30d.value).toBe(1);
    expect(m.filings8k30d.value).toBe(1);
    expect(catalystMetrics([], "2026-11-22", prov, null).filings8k30d.value).toBeNull();
  });

  test("volatility and drawdown", () => {
    expect(maxDrawdown([100, 120, 90, 130, 117])).toBeCloseTo(0.25, 10);
    expect(annualisedVolatility([100, 100, 100])).toBe(0);
    expect(annualisedVolatility([100])).toBeNull();
  });
});

test.describe("per-share cross-check", () => {
  const pe = (value: number | null) => ({ value, unit: "multiple" as const, formula: "P/E", provenance: { source: "model" as const, asOf: "" } });

  test("parses CNBC compact numbers", () => {
    expect(parseCnbcNumber("11.275B")).toBe(11.275e9);
    expect(parseCnbcNumber("820M")).toBe(820e6);
    expect(parseCnbcNumber("1,234.5")).toBe(1234.5);
    expect(parseCnbcNumber("n/a")).toBeNull();
  });

  test("drops a P/E that differs from CNBC by more than 2x with a neutral reason, keeps close ones", () => {
    const bad = checkPe(pe(0.86), "15.63");
    expect(bad.pe.value).toBeNull();
    expect(bad.warning).toContain("pending a check");
    expect(checkPe(pe(380), "415.65").pe.value).toBe(380);
    expect(checkPe(pe(20), undefined).pe.value).toBe(20);
  });
});
