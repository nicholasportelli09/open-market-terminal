import { expect, test } from "@playwright/test";
import {
  applyIbkrRows,
  buildLedger,
  buildSnapshot,
  candidateSymbols,
  contractKey,
  createPortfolio,
  fallbackSymbol,
  flexDate,
  flexNumber,
  likelyDuplicates,
  majorCurrency,
  parseFlexStatement,
  parseFlexStatus,
  quoteMatches,
  snapshotTransactions,
  validatePortfolio,
  type FlexPosition,
} from "@/lib/portfolio";

/** Two accounts, as an Activity Flex Query (XML) with Open Positions, Cash Report and Account Information. */
const REPORT = `<FlexQueryResponse queryName="Terminal" type="AF">
<FlexStatements count="2">
<FlexStatement accountId="U1234567" fromDate="20261124" toDate="20261124" period="LastBusinessDay" whenGenerated="20261125;061500">
<AccountInformation accountId="U1234567" acctAlias="" currency="CHF" name="Someone" />
<OpenPositions>
<OpenPosition accountId="U1234567" currency="USD" fxRateToBase="0.88" assetCategory="STK" subCategory="COMMON" symbol="AAPL" description="APPLE INC" conid="265598" isin="US0378331005" listingExchange="NASDAQ" reportDate="20261124" position="10" markPrice="230.5" costBasisPrice="150.25" costBasisMoney="1502.5" levelOfDetail="SUMMARY" />
<OpenPosition accountId="U1234567" currency="GBP" assetCategory="STK" subCategory="COMMON" symbol="VOD" description="VODAFONE GROUP PLC" conid="13803" listingExchange="LSE" reportDate="20261124" position="1000" markPrice="1.02" costBasisPrice="0.9" levelOfDetail="SUMMARY" />
<OpenPosition accountId="U1234567" currency="HKD" assetCategory="STK" symbol="700" description="TENCENT HOLDINGS LTD" conid="52197301" listingExchange="SEHK" reportDate="20261124" position="100" markPrice="337.4" costBasisPrice="300" levelOfDetail="SUMMARY" />
<OpenPosition accountId="U1234567" currency="USD" assetCategory="OPT" symbol="AAPL  261218C00250000" description="AAPL 18DEC26 250 C" conid="7001" listingExchange="CBOE" reportDate="20261124" position="1" markPrice="5.1" costBasisPrice="400" levelOfDetail="SUMMARY" />
<OpenPosition accountId="U1234567" currency="USD" assetCategory="STK" symbol="TSLA" description="TESLA INC" conid="76792991" listingExchange="NASDAQ" reportDate="20261124" position="-5" markPrice="300" costBasisPrice="310" levelOfDetail="SUMMARY" />
</OpenPositions>
<CashReport>
<CashReportCurrency accountId="U1234567" currency="BASE_SUMMARY" levelOfDetail="BaseCurrency" endingCash="9999" />
<CashReportCurrency accountId="U1234567" currency="USD" levelOfDetail="Currency" endingCash="1250.75" />
<CashReportCurrency accountId="U1234567" currency="EUR" levelOfDetail="Currency" endingCash="-300" />
</CashReport>
</FlexStatement>
<FlexStatement accountId="U7654321" fromDate="20261124" toDate="20261124" period="LastBusinessDay">
<AccountInformation accountId="U7654321" acctAlias="Kids &amp; Co" currency="USD" />
<OpenPositions>
<OpenPosition accountId="U7654321" currency="USD" assetCategory="STK" subCategory="ETF" symbol="VOO" description="VANGUARD S&amp;P 500 ETF" conid="136155102" listingExchange="ARCA" reportDate="20261124" position="3" markPrice="600" costBasisPrice="500" levelOfDetail="SUMMARY" />
<OpenPosition accountId="U7654321" currency="USD" assetCategory="STK" symbol="MSFT" description="MICROSOFT CORP" conid="272093" listingExchange="NASDAQ" reportDate="20261124" position="5" markPrice="480" costBasisPrice="400" levelOfDetail="SUMMARY" />
<OpenPosition accountId="U7654321" currency="USD" assetCategory="STK" symbol="MSFT" description="MICROSOFT CORP" conid="272093" listingExchange="NASDAQ" reportDate="20261124" position="2" costBasisPrice="350" openDateTime="20240115;093000" levelOfDetail="LOT" />
<OpenPosition accountId="U7654321" currency="USD" assetCategory="STK" symbol="MSFT" description="MICROSOFT CORP" conid="272093" listingExchange="NASDAQ" reportDate="20261124" position="3" costBasisPrice="433.33" openDateTime="20250610;101500" levelOfDetail="LOT" />
</OpenPositions>
</FlexStatement>
</FlexStatements>
</FlexQueryResponse>`;

const RESOLVED: Record<string, string> = { "265598": "AAPL", "13803": "VOD-GB", "52197301": "700-HK", "136155102": "VOO", "272093": "MSFT" };
const resolve = (p: FlexPosition) => (RESOLVED[p.conid] ? { symbol: RESOLVED[p.conid] } : null);
const NOW = new Date("2026-11-25T09:00:00Z");

test("Flex status replies: success with a reference code, and IBKR errors", () => {
  expect(parseFlexStatus("<FlexStatementResponse timestamp='x'><Status>Success</Status><ReferenceCode>1234567890</ReferenceCode><Url>https://x</Url></FlexStatementResponse>")).toEqual({ ok: true, referenceCode: "1234567890" });
  expect(parseFlexStatus("<FlexStatementResponse timestamp='x'>\n<Status>Fail</Status>\n<ErrorCode>1015</ErrorCode>\n<ErrorMessage>Token is invalid.</ErrorMessage>\n</FlexStatementResponse>")).toEqual({ ok: false, code: 1015, message: "Token is invalid." });
  expect(parseFlexStatus(REPORT)).toBeNull();
});

test("Flex report parsing: accounts, positions, cash, entities; CSV and junk are refused", () => {
  const r = parseFlexStatement(REPORT);
  expect(r.ok).toBe(true);
  if (!r.ok) return;
  expect(r.accounts.map((a) => [a.accountId, a.baseCurrency, a.alias])).toEqual([["U1234567", "CHF", ""], ["U7654321", "USD", "Kids & Co"]]);
  expect(r.accounts[0].cash).toEqual([{ currency: "USD", endingCash: 1250.75 }, { currency: "EUR", endingCash: -300 }]);
  expect(r.accounts[1].positions[0].description).toBe("VANGUARD S&P 500 ETF");
  expect(r.accounts[1].positions.filter((p) => p.level === "lot").map((p) => p.openDate)).toEqual(["2024-01-15", "2025-06-10"]);
  expect(parseFlexStatement('"ClientAccountID","Symbol"\n"U1","AAPL"')).toMatchObject({ ok: false });
  expect(parseFlexStatement("<html>nope</html>")).toMatchObject({ ok: false });
});

test("Flex dates in every Client Portal format", () => {
  expect(flexDate("20261124")).toBe("2026-11-24");
  expect(flexDate("2026-11-24")).toBe("2026-11-24");
  expect(flexDate("20240115;093000")).toBe("2024-01-15");
  expect(flexDate("11/24/2026")).toBe("2026-11-24");
  expect(flexDate("24/11/2026")).toBe("2026-11-24");
  expect(flexDate("20261340")).toBeNull();
  expect(flexDate("")).toBeNull();
});

test("IBKR contract to app symbol guesses, and the quote sanity check", () => {
  const c = (symbol: string, listingExchange: string, currency: string, assetCategory = "STK") => ({ symbol, listingExchange, currency, assetCategory, markPrice: null });
  expect(candidateSymbols(c("AAPL", "NASDAQ", "USD"))).toEqual(["AAPL"]);
  expect(candidateSymbols(c("BRK B", "NYSE", "USD"))).toEqual(["BRK.B"]);
  expect(candidateSymbols(c("VOD", "LSE", "GBP"))).toEqual(["VOD-GB"]);
  expect(candidateSymbols(c("SAP", "IBIS", "EUR"))).toEqual(["SAP-DE"]);
  expect(candidateSymbols(c("VOLV B", "SFB", "SEK"))).toEqual(["VOLV.B-SE"]);
  expect(candidateSymbols(c("700", "SEHK", "HKD"))).toEqual(["700-HK"]);
  expect(candidateSymbols(c("9984", "TSEJ", "JPY"))).toEqual(["9984.T-JP"]);
  expect(candidateSymbols(c("5930", "KSE", "KRW"))).toEqual(["005930-KR"]);
  expect(candidateSymbols(c("RY", "TSE", "CAD"))).toEqual(["RY-CA"]);
  expect(candidateSymbols(c("BTC", "PAXOS", "USD", "CRYPTO"))).toEqual(["BTC.CM=", "BTC"]);
  expect(fallbackSymbol(c("XYZ B", "BVME.ETF", "EUR"))).toBe("XYZ.B-BVMEETF");

  const vod = { symbol: "VOD", listingExchange: "LSE", currency: "GBP", assetCategory: "STK", markPrice: 1.02 };
  expect(majorCurrency("GBp")).toEqual({ currency: "GBP", divisor: 100 });
  expect(quoteMatches(vod, { symbol: "VOD-GB", currency: "GBp", last: 102.3 })).toBe(true);
  expect(quoteMatches(vod, { symbol: "VOD", currency: "USD", last: 10.2 })).toBe(false);
  expect(quoteMatches({ ...vod, markPrice: 5 }, { symbol: "VOD-GB", currency: "GBp", last: 102.3 })).toBe(false);
});

test("snapshot: lots beat summary rows, options and shorts are skipped with a note, accounts are masked", () => {
  const r = parseFlexStatement(REPORT);
  if (!r.ok) throw new Error(r.error);
  const snap = buildSnapshot(r.accounts, resolve, NOW.toISOString());
  const [a, b] = snap.accounts;
  expect(a.label).toBe("U•••4567");
  expect(b.label).toBe("Kids & Co");
  expect(a.holdings.map((h) => h.symbol)).toEqual(["AAPL", "VOD-GB", "700-HK"]);
  expect(a.notes.join(" ")).toMatch(/1 option position/);
  expect(a.notes.join(" ")).toMatch(/1 short position/);
  const msft = b.holdings.find((h) => h.symbol === "MSFT");
  expect(msft?.lots).toEqual([{ date: "2024-01-15", quantity: 2, unitCost: 350 }, { date: "2025-06-10", quantity: 3, unitCost: 433.33 }]);
  expect(b.holdings.find((h) => h.symbol === "VOO")?.assetType).toBe("etf");
  expect(contractKey(r.accounts[1].positions[1])).toBe("272093");
});

test("import: ledger lands exactly on IBKR quantities and cash; re-sync replaces, hand entries stay", () => {
  const r = parseFlexStatement(REPORT);
  if (!r.ok) throw new Error(r.error);
  const snap = buildSnapshot(r.accounts, resolve, NOW.toISOString());
  const rows = snapshotTransactions(snap, ["U1234567", "U7654321"], NOW);
  const manual = { id: "m1", date: "2026-01-02", type: "deposit" as const, amount: 500, currency: "CHF", createdAt: "2026-01-02T00:00:00Z", updatedAt: "2026-01-02T00:00:00Z" };
  const start = { ...createPortfolio("P", "CHF", NOW), transactions: [manual] };
  const p = applyIbkrRows(start, rows, "keep_manual", NOW);
  expect(validatePortfolio(p, { today: "2026-11-25" })).toEqual([]);
  const ledger = buildLedger(p);
  const qty = Object.fromEntries(Object.values(ledger.positions).map((x) => [x.symbol, x.quantity]));
  expect(qty).toEqual({ AAPL: 10, "VOD-GB": 1000, "700-HK": 100, VOO: 3, MSFT: 5 });
  expect(ledger.cash.USD).toBeCloseTo(1250.75, 6);
  expect(ledger.cash.EUR).toBeCloseTo(-300, 6);
  expect(ledger.cash.CHF).toBeCloseTo(500, 6);

  // Second sync with one account: IBKR rows are replaced, the hand-entered deposit is kept.
  const again = applyIbkrRows(p, snapshotTransactions(snap, ["U7654321"], NOW), "keep_manual", NOW);
  expect(again.transactions.filter((t) => t.id === "m1")).toHaveLength(1);
  expect(new Set(again.transactions.filter((t) => t.symbol).map((t) => t.symbol))).toEqual(new Set(["VOO", "MSFT"]));
  expect(applyIbkrRows(p, rows, "replace_all", NOW).transactions.some((t) => t.id === "m1")).toBe(false);
});

test("summary groups per-holding 'converted at current FX' warnings into one line each", async () => {
  const { groupFxWarnings } = await import("@/components/portfolio/summary-model");
  expect(
    groupFxWarnings(["cost of AAPL converted at current FX", "cost of MSFT converted at current FX", "EUR cash is negative", "deposits in USD converted at current FX", "deposits in GBP converted at current FX"]),
  ).toEqual(["Cost of AAPL, MSFT converted at today's FX (no trade-date rate)", "EUR cash is negative", "Deposits in USD, GBP converted at today's FX (no trade-date rate)"]);
});

test("parser stays linear on crafted input (no regex backtracking)", () => {
  const big = 1_000_000;
  const inputs = [
    `<FlexQueryResponse><FlexStatement><OpenPosition ${"a".repeat(big)}/>`,
    `<FlexQueryResponse><FlexStatement accountId="U1"><OpenPositions><OpenPosition symbol="X" position="${"1".repeat(big)}x"/></OpenPositions></FlexStatement></FlexQueryResponse>`,
    `<FlexQueryResponse>${"<FlexStatement ".repeat(big / 15)}`,
    `<FlexQueryResponse><FlexStatement accountId="U1">${"<OpenPosition ".repeat(big / 14)}</FlexStatement></FlexQueryResponse>`,
    `<FlexStatementResponse>${"<Status>".repeat(big / 8)}`,
  ];
  for (const xml of inputs) {
    const t0 = performance.now();
    parseFlexStatement(xml);
    expect(performance.now() - t0).toBeLessThan(1_000);
  }
  expect(flexNumber("1".repeat(50))).toBeNull();
  expect(flexNumber("12.5")).toBe(12.5);
  expect(flexNumber(".5")).toBe(0.5);
  expect(flexNumber("-3e2")).toBe(-300);
});

test("a multi-day report keeps only the latest statement per account", () => {
  const day = (d: string, qty: number) =>
    `<FlexStatement accountId="U1" toDate="${d}"><OpenPositions><OpenPosition accountId="U1" currency="USD" assetCategory="STK" symbol="AAPL" conid="1" listingExchange="NASDAQ" position="${qty}" costBasisPrice="100" levelOfDetail="SUMMARY"/></OpenPositions></FlexStatement>`;
  const r = parseFlexStatement(`<FlexQueryResponse><FlexStatements>${day("20261121", 5)}${day("20261124", 7)}${day("20261122", 6)}</FlexStatements></FlexQueryResponse>`);
  if (!r.ok) throw new Error(r.error);
  expect(r.accounts).toHaveLength(1);
  expect(r.accounts[0].positions[0].quantity).toBe(7);
});

test("same symbol in two currencies gets a distinct stand-in symbol, so the import stays valid", () => {
  const xml = `<FlexQueryResponse><FlexStatements>
<FlexStatement accountId="U1"><OpenPositions>
<OpenPosition accountId="U1" currency="USD" assetCategory="STK" symbol="SHEL" conid="10" listingExchange="NYSE" position="10" costBasisPrice="70" levelOfDetail="SUMMARY"/>
<OpenPosition accountId="U1" currency="EUR" assetCategory="STK" symbol="SHEL" conid="11" listingExchange="AEB" position="10" costBasisPrice="30" levelOfDetail="SUMMARY"/>
</OpenPositions></FlexStatement></FlexStatements></FlexQueryResponse>`;
  const r = parseFlexStatement(xml);
  if (!r.ok) throw new Error(r.error);
  const snap = buildSnapshot(r.accounts, () => ({ symbol: "SHEL" }), NOW.toISOString());
  const syms = snap.accounts[0].holdings.map((h) => [h.symbol, h.currency, h.live]);
  expect(syms).toEqual([["SHEL", "USD", true], ["SHEL-EUR", "EUR", false]]);
  const p = applyIbkrRows(createPortfolio("P", "USD", NOW), snapshotTransactions(snap, ["U1"], NOW), "keep_manual", NOW);
  expect(validatePortfolio(p, { today: "2026-11-25" })).toEqual([]);
});

test("re-sync keeps the first-seen date of a summary holding instead of moving it forward", () => {
  const r = parseFlexStatement(REPORT);
  if (!r.ok) throw new Error(r.error);
  const snap = buildSnapshot(r.accounts, resolve, NOW.toISOString());
  const first = snapshotTransactions(snap, ["U1234567"], NOW);
  const earlier = first.map((t) => (t.symbol === "AAPL" ? { ...t, date: "2026-10-01" } : t));
  const later = snapshotTransactions(snap, ["U1234567"], new Date("2026-11-26T09:00:00Z"), earlier);
  expect(later.find((t) => t.symbol === "AAPL")?.date).toBe("2026-10-01");
  expect(later.find((t) => t.symbol === "700-HK")?.date).toBe("2026-11-24");
});

test("a '>' inside a quoted attribute value does not cut the row", () => {
  const xml = `<FlexQueryResponse><FlexStatements><FlexStatement accountId="U1" toDate="20261124"><OpenPositions><OpenPosition accountId="U1" currency="USD" assetCategory="STK" symbol="AAA" description="A > B" conid="5" listingExchange="NYSE" position="10" costBasisPrice="5" levelOfDetail="SUMMARY"/></OpenPositions></FlexStatement></FlexStatements></FlexQueryResponse>`;
  const r = parseFlexStatement(xml);
  if (!r.ok) throw new Error(r.error);
  expect(r.accounts[0].positions.map((p) => [p.description, p.quantity])).toEqual([["A > B", 10]]);
});

test("imported rows avoid a symbol a hand-entered row uses in another currency; likely duplicate trades are found", () => {
  const ts = "2026-01-01T00:00:00Z";
  const hand = { id: "h1", date: "2026-01-01", type: "buy" as const, symbol: "SAP-DE", quantity: 1, price: 100, currency: "USD", createdAt: ts, updatedAt: ts };
  const ibkr = { id: "ibkr:1", date: "2026-11-24", type: "buy" as const, symbol: "SAP-DE", quantity: 5, price: 200, currency: "EUR", note: "IBKR U1", createdAt: ts, updatedAt: ts };
  const p = applyIbkrRows({ ...createPortfolio("P", "EUR", NOW), transactions: [hand] }, [ibkr], "keep_manual", NOW);
  expect(p.transactions.find((t) => t.id === "ibkr:1")?.symbol).toBe("SAP-DE-EUR");
  expect(validatePortfolio(p, { today: "2026-11-25" })).toEqual([]);

  const sell = { id: "h2", date: "2026-11-25", type: "sell" as const, symbol: "AAPL", quantity: 2, price: 300, currency: "USD", createdAt: ts, updatedAt: ts };
  const own = { ...ibkr, id: "ibkr:2", symbol: "AAPL", currency: "USD" };
  const q = { ...createPortfolio("P", "USD", NOW), transactions: [own, sell] };
  expect(likelyDuplicates(q).map((t) => t.id)).toEqual(["h2"]);
});

test("re-sync keeps the first import's createdAt, so same-day hand rows keep their order", () => {
  const r = parseFlexStatement(REPORT);
  if (!r.ok) throw new Error(r.error);
  const snap = buildSnapshot(r.accounts, resolve, NOW.toISOString());
  const first = snapshotTransactions(snap, ["U1234567"], NOW);
  const later = snapshotTransactions(snap, ["U1234567"], new Date("2026-11-26T09:00:00Z"), first);
  const aaplFirst = first.find((t) => t.symbol === "AAPL");
  expect(later.find((t) => t.symbol === "AAPL")?.createdAt).toBe(aaplFirst?.createdAt);
});

test("re-sync never replaces a saved account that is missing from the report", async () => {
  const { accountsToSync } = await import("@/lib/client/ibkr-connection");
  // Every account was chosen; one of them is missing today. Before, this deleted its holdings.
  expect(accountsToSync({ accounts: ["U1", "U2"], allAccounts: true }, ["U1"])).toEqual({ ok: false, missing: ["U2"] });
  expect(accountsToSync({ accounts: ["U1", "U2"], allAccounts: true }, ["U1", "U2", "U3"])).toEqual({ ok: true, ids: ["U1", "U2", "U3"] });
  expect(accountsToSync({ accounts: ["U1"], allAccounts: false }, ["U1", "U2"])).toEqual({ ok: true, ids: ["U1"] });
  // A connection saved without account ids is never synced blindly.
  expect(accountsToSync({ accounts: [], allAccounts: true }, ["U1"])).toEqual({ ok: false, missing: [] });
});
