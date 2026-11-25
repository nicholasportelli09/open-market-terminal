/**
 * NYSE holidays and early closes, 2025-2027.
 * Source: NYSE Group "2025, 2026 and 2027 Holiday and Early Closings Calendar" (ir.theice.com, Nov 2024)
 * and nyse.com/markets/hours-calendars, checked 2026-11-21, plus the 2025-01-09 closure for the national
 * day of mourning for President Carter.
 */

export const NYSE_HOLIDAYS: Record<string, string> = {
  "2025-01-01": "New Year's Day",
  "2025-01-09": "National Day of Mourning",
  "2025-01-20": "Martin Luther King Jr. Day",
  "2025-02-17": "Washington's Birthday",
  "2025-04-18": "Good Friday",
  "2025-05-26": "Memorial Day",
  "2025-06-19": "Juneteenth",
  "2025-07-04": "Independence Day",
  "2025-09-01": "Labor Day",
  "2025-11-27": "Thanksgiving",
  "2025-12-25": "Christmas",
  "2026-01-01": "New Year's Day",
  "2026-01-19": "Martin Luther King Jr. Day",
  "2026-02-16": "Washington's Birthday",
  "2026-04-03": "Good Friday",
  "2026-05-25": "Memorial Day",
  "2026-06-19": "Juneteenth",
  "2026-07-03": "Independence Day (observed)",
  "2026-09-07": "Labor Day",
  "2026-11-26": "Thanksgiving",
  "2026-12-25": "Christmas",
  "2027-01-01": "New Year's Day",
  "2027-01-18": "Martin Luther King Jr. Day",
  "2027-02-15": "Washington's Birthday",
  "2027-03-26": "Good Friday",
  "2027-05-31": "Memorial Day",
  "2027-06-18": "Juneteenth (observed)",
  "2027-07-05": "Independence Day (observed)",
  "2027-09-06": "Labor Day",
  "2027-11-25": "Thanksgiving",
  "2027-12-24": "Christmas (observed)",
};

/** Regular session ends 1:00 PM ET; late (post) trading ends 5:00 PM ET. */
export const NYSE_EARLY_CLOSES: readonly string[] = [
  "2025-07-03", "2025-11-28", "2025-12-24", "2026-11-27", "2026-12-24", "2027-11-26",
];

/** Years the two tables above cover. */
export const NYSE_CALENDAR_YEARS: readonly number[] = [2025, 2026, 2027];
