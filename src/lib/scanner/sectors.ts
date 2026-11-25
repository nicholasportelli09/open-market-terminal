/**
 * Broad sector groups from the SEC Standard Industrial Classification (SIC) code in each company's EDGAR
 * profile. These are SIC groupings, not GICS sectors: e.g. Visa and Mastercard file under SIC 7389
 * (business services) and Alphabet under 7370 (computer services), so they land in those groups.
 */

export const UNCLASSIFIED = "Unclassified";

type Range = { from: number; to: number; group: string };

/** First match wins, so narrow ranges come before the wide ones they sit inside. */
const RANGES: readonly Range[] = [
  { from: 6324, to: 6324, group: "Health care" }, // hospital and medical service plans
  { from: 6798, to: 6798, group: "Real estate" }, // REITs
  { from: 6500, to: 6599, group: "Real estate" },
  { from: 6000, to: 6799, group: "Financials" },
  { from: 1300, to: 1399, group: "Energy" },
  { from: 2900, to: 2999, group: "Energy" },
  { from: 4610, to: 4619, group: "Energy" },
  { from: 2830, to: 2836, group: "Health care" },
  { from: 3841, to: 3851, group: "Health care" },
  { from: 5912, to: 5912, group: "Health care" }, // drug stores
  { from: 8000, to: 8099, group: "Health care" },
  { from: 8731, to: 8731, group: "Health care" }, // commercial physical and biological research
  { from: 2000, to: 2199, group: "Consumer staples" },
  { from: 2840, to: 2844, group: "Consumer staples" },
  { from: 5310, to: 5499, group: "Consumer staples" }, // general merchandise and grocery stores
  { from: 3570, to: 3579, group: "Technology hardware" },
  { from: 3660, to: 3699, group: "Technology hardware" }, // communications equipment, semiconductors
  { from: 3559, to: 3559, group: "Technology hardware" }, // special industry machinery (chip equipment)
  { from: 3826, to: 3826, group: "Health care" }, // laboratory analytical instruments (life-science tools)
  { from: 3823, to: 3829, group: "Technology hardware" },
  { from: 7370, to: 7379, group: "Software and internet" },
  { from: 4800, to: 4899, group: "Telecom and media" },
  { from: 7810, to: 7849, group: "Telecom and media" },
  { from: 7900, to: 7999, group: "Telecom and media" }, // amusement and recreation (theme parks, entertainment)
  { from: 2700, to: 2799, group: "Telecom and media" },
  { from: 4900, to: 4999, group: "Utilities" },
  { from: 3710, to: 3716, group: "Autos" },
  { from: 5000, to: 5999, group: "Retail and consumer services" },
  { from: 7000, to: 7099, group: "Retail and consumer services" },
  { from: 4700, to: 4799, group: "Retail and consumer services" }, // travel arrangement
  { from: 7380, to: 7399, group: "Business services" },
  { from: 7300, to: 7369, group: "Business services" },
  { from: 8700, to: 8799, group: "Business services" },
  { from: 1000, to: 1499, group: "Materials" },
  { from: 2800, to: 2899, group: "Materials" },
  { from: 3300, to: 3399, group: "Materials" },
  { from: 2600, to: 2699, group: "Materials" },
  { from: 3720, to: 3799, group: "Industrials and transport" }, // aerospace, defense, ships
  { from: 3400, to: 3569, group: "Industrials and transport" },
  { from: 3580, to: 3659, group: "Industrials and transport" },
  { from: 3800, to: 3822, group: "Industrials and transport" },
  { from: 4000, to: 4599, group: "Industrials and transport" },
  { from: 1500, to: 1799, group: "Industrials and transport" },
  { from: 2200, to: 2599, group: "Consumer staples" },
  { from: 3000, to: 3299, group: "Materials" },
];

/**
 * Hand overrides where the SIC code puts a company in a misleading group: Danaher (SIC 3823, industrial
 * instruments) and Thermo Fisher (SIC 3829, measuring devices) are life-science and diagnostics companies.
 */
const OVERRIDES: Readonly<Record<string, string>> = { DHR: "Health care", TMO: "Health care" };

/** The drawer note for an overridden sector; null when the SIC mapping is used as is. */
export function sectorOverrideNote(symbol: string): string | null {
  const group = OVERRIDES[symbol.toUpperCase()];
  return group ? `Sector set to ${group} by hand: its SIC code groups it with instrument makers.` : null;
}

/** Sector for a company: a hand override for the ticker when one exists, else the SIC group. */
export function sectorFor(symbol: string, sic: string | null | undefined): string {
  return OVERRIDES[symbol.toUpperCase()] ?? sectorFromSic(sic);
}

/** Broad sector group for a SIC code; UNCLASSIFIED when missing or outside the table. */
export function sectorFromSic(sic: string | null | undefined): string {
  const n = Number(sic);
  if (!sic || !Number.isInteger(n)) return UNCLASSIFIED;
  return RANGES.find((r) => n >= r.from && n <= r.to)?.group ?? UNCLASSIFIED;
}
