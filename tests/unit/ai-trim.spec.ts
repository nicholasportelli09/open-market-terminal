import { expect, test } from "@playwright/test";
import type { AnalystAnswer, Claim } from "@/lib/ai/types";
import { limitsInstruction, trimAnswer } from "@/lib/server/ai/trim";

const claim = (text: string, refs: string[] = []): Claim => ({ kind: "fact", text, refs });
const answer = (sections: { heading: string; claims: Claim[] }[]): AnalystAnswer => ({
  sections,
  citations: [
    { id: "S1", kind: "data", title: "quotes" },
    { id: "W1", kind: "web", title: "news", url: "https://example.com" },
    { id: "W2", kind: "web", title: "dropped", url: "https://example.com/2" },
  ],
  model: "m",
  generatedAt: "2026-11-24T00:00:00Z",
  usedWebSearch: true,
  warnings: [],
});

test("trimAnswer caps lines per section and in total, keeps every section's lead line, drops orphaned sources", () => {
  const a = answer([
    { heading: "A", claims: [claim("a1", ["S1"]), claim("a2"), claim("a3"), claim("a4", ["W2"]), claim("a5")] },
    { heading: "B", claims: [claim("b1", ["W1"]), claim("b2"), claim("b3")] },
    { heading: "C", claims: [claim("c1")] },
    { heading: "D", claims: [] },
    { heading: "E", claims: [claim("e1")] },
  ]);
  const t = trimAnswer(a, { maxLines: 5, perSection: 3, maxSections: 3 });
  expect(t.sections.map((s) => [s.heading, s.claims.map((c) => c.text)])).toEqual([
    ["A", ["a1", "a2"]],
    ["B", ["b1", "b2"]],
    ["C", ["c1"]],
  ]);
  expect(t.citations.map((c) => c.id)).toEqual(["S1", "W1"]);
  expect(a.sections[0].claims).toHaveLength(5); // input not mutated
});

test("trimAnswer leaves a short answer alone, and the instruction states the same limits", () => {
  const a = answer([{ heading: "A", claims: [claim("a1", ["S1"])] }]);
  expect(trimAnswer(a, { maxLines: 6 }).sections).toEqual(a.sections);
  expect(limitsInstruction({ maxLines: 8, perSection: 3 })).toContain("at most 8 lines in total");
});
