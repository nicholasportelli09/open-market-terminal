import { expect, test } from "@playwright/test";
import {
  classifyInstrument,
  instrumentSession,
  nextRegularOpen,
  nyDateTime,
  quoteStamp,
  usEquitySession,
  type SessionQuote,
} from "@/lib/market-session";
import { fmtBp, fmtOpensAt } from "@/lib/format";

/** New York wall-clock time -> instant (via the module under test, cross-checked below). */
const ny = (dateKey: string, hh: number, mm = 0) => nyDateTime(dateKey, hh * 60 + mm);

const AAPL: SessionQuote = { symbol: "AAPL", type: "STOCK", exchange: "NASDAQ", country: "US", time: "2026-11-20" };
const SPX: SessionQuote = { symbol: ".SPX", type: "INDEX", exchange: "INDEX", country: "US", time: "2026-11-20" };
const EUR: SessionQuote = { symbol: "EUR=", type: "CURRENCY", exchange: "Exchange", country: "EU", time: null };
const CL: SessionQuote = { symbol: "@CL.1", type: "DERIVATIVE", exchange: "NYMEX", country: "US", time: null };
const BTC: SessionQuote = { symbol: "BTC.CM=", type: "INDEX", exchange: "Exchange", country: "CH", time: null };
const US10Y: SessionQuote = { symbol: "US10Y", type: "BOND", exchange: "Tradeweb", country: "US", time: null };

test("New York conversion is DST-correct", () => {
  expect(ny("2026-07-15", 9, 30).toISOString()).toBe("2026-07-15T13:30:00.000Z"); // EDT, UTC-4
  expect(ny("2026-11-20", 9, 30).toISOString()).toBe("2026-11-20T14:30:00.000Z"); // EST, UTC-5
  // 2026 DST: starts Sun Mar 8, ends Sun Nov 1.
  expect(ny("2026-03-09", 9, 30).toISOString()).toBe("2026-03-09T13:30:00.000Z");
  expect(ny("2026-03-06", 9, 30).toISOString()).toBe("2026-03-06T14:30:00.000Z");
  expect(ny("2026-11-02", 9, 30).toISOString()).toBe("2026-11-02T14:30:00.000Z");
  expect(ny("2026-10-30", 9, 30).toISOString()).toBe("2026-10-30T13:30:00.000Z");
});

test("weekday sessions: pre, regular, post, overnight", () => {
  const day = "2026-11-18"; // Wednesday
  expect(usEquitySession(ny(day, 3, 59))).toMatchObject({ session: "closed", reason: "overnight" });
  expect(usEquitySession(ny(day, 4))).toMatchObject({ session: "pre" });
  const pre = usEquitySession(ny(day, 9, 29));
  expect(pre.session).toBe("pre");
  expect(pre.opensAt?.toISOString()).toBe("2026-11-18T14:30:00.000Z");
  const open = usEquitySession(ny(day, 9, 30));
  expect(open.session).toBe("regular");
  expect(open.closesAt?.toISOString()).toBe("2026-11-18T21:00:00.000Z");
  expect(open.earlyClose).toBe(false);
  expect(usEquitySession(ny(day, 15, 59)).session).toBe("regular");
  expect(usEquitySession(ny(day, 16)).session).toBe("post");
  expect(usEquitySession(ny(day, 19, 59)).session).toBe("post");
  const late = usEquitySession(ny(day, 20));
  expect(late).toMatchObject({ session: "closed", reason: "overnight" });
  expect(late.opensAt?.toISOString()).toBe("2026-11-19T14:30:00.000Z");
});

test("weekend: closed, opens Monday 9:30", () => {
  const sat = new Date("2026-11-21T17:54:00Z"); // Sat 12:54 ET, the day CNBC said REG_MKT for .SPX
  const s = usEquitySession(sat);
  expect(s).toMatchObject({ session: "closed", reason: "weekend", calendarCovered: true });
  expect(s.opensAt?.toISOString()).toBe("2026-11-23T14:30:00.000Z");
  expect(fmtOpensAt(s.opensAt!, sat)).toBe("Opens Mon 9:30 AM ET");
  expect(instrumentSession(SPX, sat)).toBe("closed");
  expect(instrumentSession(AAPL, sat)).toBe("closed");
});

test("holiday: Thanksgiving 2026 closed all day, opens Friday", () => {
  const s = usEquitySession(ny("2026-11-26", 11));
  expect(s).toMatchObject({ session: "closed", reason: "holiday", holidayName: "Thanksgiving" });
  expect(s.opensAt?.toISOString()).toBe("2026-11-27T14:30:00.000Z");
  expect(usEquitySession(ny("2026-11-26", 5)).session).toBe("closed");
  expect(usEquitySession(ny("2026-11-26", 17)).session).toBe("closed");
});

test("early close: Fri 2026-11-27 regular to 1:00 PM, post to 5:00 PM", () => {
  const day = "2026-11-27";
  const open = usEquitySession(ny(day, 12, 59));
  expect(open).toMatchObject({ session: "regular", earlyClose: true });
  expect(open.closesAt?.toISOString()).toBe("2026-11-27T18:00:00.000Z");
  expect(usEquitySession(ny(day, 13))).toMatchObject({ session: "post", earlyClose: true });
  expect(usEquitySession(ny(day, 16, 59)).session).toBe("post");
  expect(usEquitySession(ny(day, 17))).toMatchObject({ session: "closed", reason: "overnight" });
  expect(quoteStamp({ ...AAPL, time: day }, ny(day, 18))?.at?.toISOString()).toBe("2026-11-27T18:00:00.000Z");
});

test("observed holidays from the NYSE calendar", () => {
  expect(usEquitySession(ny("2026-07-03", 11)).holidayName).toBe("Independence Day (observed)");
  expect(usEquitySession(ny("2027-06-18", 11)).holidayName).toBe("Juneteenth (observed)");
  expect(usEquitySession(ny("2027-12-24", 11)).holidayName).toBe("Christmas (observed)");
  expect(usEquitySession(ny("2025-01-09", 11)).reason).toBe("holiday");
  expect(usEquitySession(ny("2025-12-26", 11)).session).toBe("regular");
  expect(usEquitySession(ny("2025-12-24", 13, 30)).session).toBe("post");
  // Christmas Eve 2026 is a Thursday early close; Friday is Christmas; next open is Monday.
  expect(nextRegularOpen(ny("2026-12-24", 14))?.toISOString()).toBe("2026-12-28T14:30:00.000Z");
});

test("DST boundary days keep 9:30 ET opens", () => {
  expect(usEquitySession(new Date("2026-03-09T13:30:00Z")).session).toBe("regular"); // 9:30 EDT
  expect(usEquitySession(new Date("2026-03-09T13:29:00Z")).session).toBe("pre");
  expect(usEquitySession(new Date("2026-11-02T14:29:00Z")).session).toBe("pre"); // 9:29 EST
  expect(usEquitySession(new Date("2026-11-02T14:30:00Z")).session).toBe("regular");
  // Friday before the spring change: opensAt Monday is computed on the new offset.
  expect(nextRegularOpen(new Date("2026-03-06T22:00:00Z"))?.toISOString()).toBe("2026-03-09T13:30:00.000Z");
});

test("FX trades Sunday 17:00 to Friday 17:00 ET", () => {
  expect(instrumentSession(EUR, ny("2026-11-20", 16, 59))).toBe("continuous");
  expect(instrumentSession(EUR, ny("2026-11-20", 17))).toBe("closed");
  expect(instrumentSession(EUR, ny("2026-11-21", 12))).toBe("closed");
  expect(instrumentSession(EUR, ny("2026-11-22", 16, 59))).toBe("closed");
  expect(instrumentSession(EUR, ny("2026-11-22", 17))).toBe("continuous");
  expect(instrumentSession({ ...EUR, symbol: ".DXY", type: "INDEX" }, ny("2026-11-18", 3))).toBe("continuous");
});

test("CME futures: daily 17:00-18:00 halt, weekend closed", () => {
  expect(instrumentSession(CL, ny("2026-11-18", 16, 59))).toBe("regular");
  expect(instrumentSession(CL, ny("2026-11-18", 17, 30))).toBe("closed");
  expect(instrumentSession(CL, ny("2026-11-18", 18))).toBe("regular");
  expect(instrumentSession(CL, ny("2026-11-20", 17, 30))).toBe("closed");
  expect(instrumentSession(CL, ny("2026-11-21", 12))).toBe("closed");
  expect(instrumentSession(CL, ny("2026-11-22", 17, 59))).toBe("closed");
  expect(instrumentSession(CL, ny("2026-11-22", 18))).toBe("regular");
});

test("crypto, treasuries, indices and non-US heuristics", () => {
  const sat = ny("2026-11-21", 12);
  expect(instrumentSession(BTC, sat)).toBe("continuous");
  expect(instrumentSession(US10Y, ny("2026-11-18", 8))).toBe("regular");
  expect(instrumentSession(US10Y, ny("2026-11-18", 17))).toBe("closed");
  expect(instrumentSession(US10Y, sat)).toBe("closed");
  expect(instrumentSession(SPX, ny("2026-11-18", 8))).toBe("closed"); // indices have no pre-market
  expect(instrumentSession(AAPL, ny("2026-11-18", 8))).toBe("pre");
  expect(instrumentSession({ ...AAPL, symbol: "VIX", type: "INDEX", country: "CH" }, ny("2026-11-18", 8))).toBe("closed");
  expect(classifyInstrument({ symbol: ".VIX", type: "INDEX", country: "CH" })).toBe("us-index");

  const now = new Date("2026-11-18T10:00:00Z");
  const dax = { symbol: ".GDAXI", type: "INDEX", country: "DE" };
  expect(instrumentSession({ ...dax, time: "2026-11-18T10:50:00.000+0100" }, now)).toBe("regular");
  expect(instrumentSession({ ...dax, time: "2026-11-18T10:20:00.000+0100" }, now)).toBe("closed");
  expect(instrumentSession({ ...dax, time: "2026-11-17" }, now)).toBe("closed");
});

test("non-US indices with bare dates follow local exchange hours", () => {
  const dax = { symbol: ".GDAXI", type: "INDEX", country: "DE", time: "2026-11-18" };
  expect(instrumentSession(dax, new Date("2026-11-18T10:00:00Z"))).toBe("regular"); // 11:00 CET
  expect(instrumentSession(dax, new Date("2026-11-18T17:00:00Z"))).toBe("closed"); // 18:00 CET
  expect(instrumentSession({ ...dax, time: "2026-11-21" }, new Date("2026-11-21T10:00:00Z"))).toBe("closed"); // Saturday
  const nikkei = { symbol: ".N225", type: "INDEX", country: "JP", time: "2026-11-19" };
  expect(instrumentSession(nikkei, new Date("2026-11-19T01:00:00Z"))).toBe("regular"); // 10:00 JST
  expect(instrumentSession({ ...nikkei, time: "2026-11-18" }, new Date("2026-11-19T01:00:00Z"))).toBe("closed"); // stale date
  const hsi = { symbol: ".HSI", type: "INDEX", country: "HK", time: "2026-11-19" };
  expect(instrumentSession(hsi, new Date("2026-11-19T04:30:00Z"))).toBe("closed"); // 12:30 HKT lunch
});

test("a US bare date during that day's session has no implied close time", () => {
  const at = ny("2026-11-18", 10);
  expect(quoteStamp({ ...SPX, time: "2026-11-18" }, at)).toEqual({ at: null, dateKey: "2026-11-18" });
  expect(quoteStamp({ ...SPX, time: "2026-11-17" }, at)?.at?.toISOString()).toBe("2026-11-17T21:00:00.000Z");
});

test("quote stamps: closes for US bare dates, null for clocks running ahead", () => {
  const sat = new Date("2026-11-21T17:54:00Z");
  expect(quoteStamp(AAPL, sat)?.at?.toISOString()).toBe("2026-11-20T21:00:00.000Z");
  expect(quoteStamp({ ...SPX, symbol: ".FTSE", country: "GB" }, sat)).toEqual({ at: null, dateKey: "2026-11-20" });
  expect(quoteStamp({ ...CL, time: "2026-11-21T18:47:32.000-0500" }, sat)).toBeNull();
  expect(quoteStamp({ ...EUR, time: "2026-11-20T16:59:00.000-0500" }, sat)?.dateKey).toBe("2026-11-20");
});

test("yield changes format as basis points", () => {
  expect(fmtBp(-0.102)).toBe("−10.2 bp");
  expect(fmtBp(0.05)).toBe("+5 bp");
  expect(fmtBp(null)).toBe("—");
});
