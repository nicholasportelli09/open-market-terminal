import { expect, test } from "@playwright/test";
import type { AnalystAnswer } from "@/lib/ai/types";
import { answerWordCount, briefingCacheKey, briefingSession, countWords, lastTradingDay } from "@/lib/server/research/briefing-core";
import { symbolFromPath } from "@/components/research/drawer-store";
import { MAX_HISTORY, parseHistory, withEntry, type HistoryEntry } from "@/components/research/history";

test("word counting skips bare punctuation and counts figures once", () => {
  expect(countWords("")).toBe(0);
  expect(countWords("  The S&P 500 rose 1.2% to 6,800 — a record.  ")).toBe(9);
  expect(countWords("10-year yield: 4.25%")).toBe(3);
  const answer: Pick<AnalystAnswer, "sections"> = {
    sections: [
      { heading: "The market day", claims: [{ kind: "fact", text: "Stocks rose.", refs: ["S1"] }] },
      { claims: [{ kind: "interpretation", text: "Risk appetite improved today.", refs: [] }] },
    ],
  };
  expect(answerWordCount(answer)).toBe(3 + 2 + 4);
});

test("cache key combines market date and portfolio hash", () => {
  expect(briefingCacheKey("2026-11-20", "none")).toBe("briefing:2026-11-20:none");
  expect(briefingCacheKey("2026-11-20", "abcd1234")).not.toBe(briefingCacheKey("2026-11-21", "abcd1234"));
});

test("briefing session: weekends and pre-open cover the last session; open and after-close cover today", () => {
  // Sunday 2026-11-22, noon ET.
  const sunday = briefingSession(new Date("2026-11-22T17:00:00Z"));
  expect(sunday.marketDate).toBe("2026-11-20");
  expect(sunday.sessionNote).toContain("closed for the weekend");
  // Friday 2026-11-20, 11:00 ET (open).
  expect(briefingSession(new Date("2026-11-20T16:00:00Z")).marketDate).toBe("2026-11-20");
  // Friday 2026-11-20, 18:00 ET (after the close).
  expect(briefingSession(new Date("2026-11-20T23:00:00Z")).marketDate).toBe("2026-11-20");
  // Monday 2026-11-23, 07:00 ET (before the open) covers Friday.
  expect(briefingSession(new Date("2026-11-23T12:00:00Z")).marketDate).toBe("2026-11-20");
  // Thanksgiving 2026-11-26 is an NYSE holiday.
  expect(lastTradingDay("2026-11-26")).toBe("2026-11-25");
});

test("drawer prefill reads the ticker from quote pages only", () => {
  expect(symbolFromPath("/q/AAPL")).toBe("AAPL");
  expect(symbolFromPath("/q/BTC.CM%3D/forecast")).toBe("BTC.CM=");
  expect(symbolFromPath("/q/%E0%A4%A")).toBeNull();
  expect(symbolFromPath("/research")).toBeNull();
});

const entry = (id: string, size = 0): HistoryEntry => ({
  id,
  createdAt: "2026-11-22T10:00:00Z",
  mode: "analyze",
  symbols: ["AAPL"],
  question: "x".repeat(size),
  includedPortfolio: false,
  answer: { sections: [], citations: [], model: "m", generatedAt: "2026-11-22T10:00:00Z", usedWebSearch: false, warnings: [] },
  sources: [],
});

test("history keeps newest first, caps count and size, and ignores bad stored data", () => {
  let list: HistoryEntry[] = [];
  for (let i = 0; i < MAX_HISTORY + 5; i++) list = withEntry(list, entry(`e${i}`));
  expect(list).toHaveLength(MAX_HISTORY);
  expect(list[0].id).toBe(`e${MAX_HISTORY + 4}`);
  const big = withEntry([entry("a", 400_000), entry("b", 300_000)], entry("c", 100));
  expect(big.map((e) => e.id)).toEqual(["c", "a"]);
  expect(parseHistory("not json")).toEqual([]);
  expect(parseHistory(JSON.stringify({ version: 2, entries: [entry("a")] }))).toEqual([]);
  expect(parseHistory(JSON.stringify({ version: 1, entries: [entry("a"), { id: 1 }] })).map((e) => e.id)).toEqual(["a"]);
});
