import { expect, test } from "@playwright/test";
import { SOURCES, sourced } from "@/lib/provenance";

test("every source has a name and usage terms", () => {
  for (const s of Object.values(SOURCES)) {
    expect(s.name.length).toBeGreaterThan(0);
    expect(s.terms.length).toBeGreaterThan(0);
  }
  expect(sourced(1, { source: "sec", asOf: "2026-09-27" }).provenance.source).toBe("sec");
});
