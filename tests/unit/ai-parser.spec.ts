import { expect, test } from "@playwright/test";
import type { BetaContentBlock } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { parseAnalystMessage, type ContextDoc } from "@/lib/server/ai/parse";
import { echoableContent } from "@/lib/server/ai/request";

const DOCS: ContextDoc[] = [
  { id: "S1", title: "AAPL quote (CNBC)", provenance: { source: "cnbc", asOf: "2026-11-20T21:00:00Z", session: "closed" }, content: '{"last":228.10}' },
  { id: "S2", title: "AAPL companyfacts (SEC)", provenance: { source: "sec", asOf: "2026-09-27", url: "https://data.sec.gov/x" }, content: '{"grossMargin":0.462}' },
];

const text = (t: string, citations: Extract<BetaContentBlock, { type: "text" }>["citations"] = null): BetaContentBlock => ({
  type: "text",
  text: t,
  citations,
});

const webCite = (url: string, title: string | null, cited: string) => ({
  type: "web_search_result_location" as const,
  url,
  title,
  cited_text: cited,
  encrypted_index: "enc",
});

const search = (id: string, query: string): BetaContentBlock => ({
  type: "server_tool_use",
  id,
  name: "web_search",
  input: { query },
});

const results = (id: string, list: { url: string; title: string }[]): BetaContentBlock => ({
  type: "web_search_tool_result",
  tool_use_id: id,
  content: list.map((r) => ({ type: "web_search_result", url: r.url, title: r.title, encrypted_content: "e", page_age: null })),
});

test("parses tags, headings and S# markers into labelled claims", () => {
  const content: BetaContentBlock[] = [
    { type: "thinking", thinking: "", signature: "sig" },
    text("## Price\n[FACT] Apple closed at 228.10 [S1].\n[EST] Revenue may keep growing [S2].\n[VIEW] The move looks broad.\n## Outlook\n- [VIEW] Not available in the supplied data."),
  ];
  const out = parseAnalystMessage(content, DOCS);
  expect(out.sections.map((s) => s.heading)).toEqual(["Price", "Outlook"]);
  expect(out.sections[0].claims).toEqual([
    { kind: "fact", text: "Apple closed at 228.10.", refs: ["S1"] },
    { kind: "estimate", text: "Revenue may keep growing.", refs: ["S2"] },
    { kind: "interpretation", text: "The move looks broad.", refs: [] },
  ]);
  expect(out.sections[1].claims[0]).toEqual({ kind: "interpretation", text: "Not available in the supplied data.", refs: [] });
  expect(out.citations.map((c) => c.id)).toEqual(["S1", "S2"]);
  expect(out.citations[1]).toMatchObject({ kind: "data", title: "AAPL companyfacts (SEC)", url: "https://data.sec.gov/x" });
  expect(out.usedWebSearch).toBe(false);
  expect(out.warnings).toEqual([]);
});

test("a fact with no source is downgraded to interpretation with a warning", () => {
  const out = parseAnalystMessage([text("[FACT] Apple is the largest company.\n[FACT] Shares outstanding fell [S9].")], DOCS);
  const claims = out.sections[0].claims;
  expect(claims.map((c) => c.kind)).toEqual(["interpretation", "interpretation"]);
  expect(claims[1].refs).toEqual([]);
  expect(out.warnings.some((w) => w.includes("2 statements were labelled as fact without a source"))).toBe(true);
  expect(out.warnings.some((w) => w.includes("unknown sources: S9"))).toBe(true);
  expect(out.citations).toEqual([]);
});

test("untagged lines default to interpretation and add a warning", () => {
  const out = parseAnalystMessage([text("Markets were mixed.\n[VIEW] Hard to read.")], DOCS);
  expect(out.sections[0].claims[0]).toEqual({ kind: "interpretation", text: "Markets were mixed.", refs: [] });
  expect(out.warnings).toContain("1 line had no label and is shown as interpretation.");
});

test("web citations map to W# ids, dedupe by url and attach to the line they appear in", () => {
  const content: BetaContentBlock[] = [
    text("## News\n"),
    search("srvtoolu_1", "apple earnings"),
    results("srvtoolu_1", [
      { url: "https://example.com/a", title: "Apple results" },
      { url: "https://example.com/b", title: "Apple guidance" },
    ]),
    text("[FACT] "),
    text("Apple reported revenue of $102.5 billion", [webCite("https://example.com/a", "Apple results", "revenue of $102.5 billion")]),
    text(".\n[EST] Guidance implies growth "),
    text("next quarter", [webCite("https://example.com/b", null, "expects growth"), webCite("https://example.com/a", "Apple results", "again")]),
    text(".\n[FACT] Same source again", [webCite("https://example.com/a", "Apple results", "x")]),
    text(" [S1]."),
  ];
  const out = parseAnalystMessage(content, DOCS);
  expect(out.usedWebSearch).toBe(true);
  const claims = out.sections[0].claims;
  expect(out.sections[0].heading).toBe("News");
  expect(claims[0]).toEqual({ kind: "fact", text: "Apple reported revenue of $102.5 billion.", refs: ["W1"] });
  expect(claims[1]).toEqual({ kind: "estimate", text: "Guidance implies growth next quarter.", refs: ["W2", "W1"] });
  expect(claims[2]).toEqual({ kind: "fact", text: "Same source again.", refs: ["S1", "W1"] });
  const web = out.citations.filter((c) => c.kind === "web");
  expect(web).toEqual([
    { id: "W1", kind: "web", title: "Apple results", url: "https://example.com/a", citedText: "revenue of $102.5 billion" },
    // Citation title null -> falls back to the search result title.
    { id: "W2", kind: "web", title: "Apple guidance", url: "https://example.com/b", citedText: "expects growth" },
  ]);
  expect(out.citations[0].id).toBe("S1");
});

test("model-typed W# markers are ignored; only API citations create web refs", () => {
  const out = parseAnalystMessage([text("[FACT] Something happened [W1].")], DOCS);
  expect(out.sections[0].claims[0]).toEqual({ kind: "interpretation", text: "Something happened.", refs: [] });
});

test("a failed web search (error object) is reported as a warning, not thrown", () => {
  const content: BetaContentBlock[] = [
    search("srvtoolu_2", "fed minutes"),
    { type: "web_search_tool_result", tool_use_id: "srvtoolu_2", content: { type: "web_search_tool_result_error", error_code: "unavailable" } },
    text("[VIEW] Not available in the supplied data."),
  ];
  const out = parseAnalystMessage(content, DOCS);
  expect(out.usedWebSearch).toBe(true);
  expect(out.warnings[0]).toContain("A web search failed");
  expect(out.sections[0].claims).toHaveLength(1);
});

test("hitting the per-answer search cap is expected (cost limit) and not shown as a failure", () => {
  const content: BetaContentBlock[] = [
    search("srvtoolu_3", "fed minutes"),
    { type: "web_search_tool_result", tool_use_id: "srvtoolu_3", content: { type: "web_search_tool_result_error", error_code: "max_uses_exceeded" } },
    text("[VIEW] Not available in the supplied data."),
  ];
  const out = parseAnalystMessage(content, DOCS);
  expect(out.warnings.some((w) => w.includes("web search"))).toBe(false);
});

test("confidence scores are removed and unsourced figures are flagged", () => {
  const out = parseAnalystMessage(
    [text("[VIEW] I have 80% confidence in a rally.\n[VIEW] Margins could reach 45%.\n**[FACT]** Gross margin was 46.2% [S2, S1].")],
    DOCS,
  );
  const claims = out.sections[0].claims;
  expect(claims).toHaveLength(2);
  expect(claims[1]).toEqual({ kind: "fact", text: "Gross margin was 46.2%.", refs: ["S2", "S1"] });
  expect(out.warnings).toContain("Removed 1 line that stated a confidence or probability score.");
  expect(out.warnings).toContain("1 unsourced line contains figures; treat them as unverified.");
});

test("echoableContent drops pre-fallback thinking and unpaired tool blocks, keeps the fallback block", () => {
  const content: BetaContentBlock[] = [
    { type: "thinking", thinking: "", signature: "a" },
    search("srvtoolu_x", "q"),
    text("partial"),
    { type: "fallback", from: { model: "claude-opus-5-5" }, to: { model: "claude-opus-5" }, trigger: { type: "refusal", category: "general_harms" } },
    { type: "thinking", thinking: "", signature: "b" },
    text("rest"),
  ];
  const kept = echoableContent(content).map((b) => b.type);
  expect(kept).toEqual(["text", "fallback", "thinking", "text"]);
  // No fallback block: everything is echoed unchanged (pause_turn continuation).
  expect(echoableContent([content[0], content[1]]).map((b) => b.type)).toEqual(["thinking", "server_tool_use"]);
});

const REVENUE_DOC: ContextDoc[] = [{ id: "S1", title: "AAPL companyfacts (SEC)", content: '{"revenueTTM":391000000000,"eps":6.08}' }];

test("text on both sides of a web search stays on separate lines; the pre-search preamble is dropped", () => {
  const preamble = parseAnalystMessage(
    [text("I'll look up the latest figures."), search("srvtoolu_p", "apple revenue"), results("srvtoolu_p", []), text("## Summary\n[FACT] Revenue TTM was $391B [S1].")],
    REVENUE_DOC,
  );
  expect(preamble.sections).toEqual([{ heading: "Summary", claims: [{ kind: "fact", text: "Revenue TTM was $391B.", refs: ["S1"] }] }]);
  expect(preamble.warnings).toEqual([]);

  const split = parseAnalystMessage(
    [text("[FACT] Revenue TTM was $391B [S1]."), search("srvtoolu_q", "apple growth"), results("srvtoolu_q", []), text("[VIEW] Growth looks steady.")],
    REVENUE_DOC,
  );
  expect(split.sections[0].claims).toEqual([
    { kind: "fact", text: "Revenue TTM was $391B.", refs: ["S1"] },
    { kind: "interpretation", text: "Growth looks steady.", refs: [] },
  ]);
});

test("a fact whose figures are not in its cited sources is shown as interpretation", () => {
  const out = parseAnalystMessage(
    [
      text("[FACT] "),
      text("Apple revenue rose 6%", [webCite("https://example.com/r", "Apple results", "Apple revenue rose")]),
      text(" and its margin hit 52.9% this quarter.\n[FACT] EPS was $9.99 [S1].\n[FACT] EPS was $6.08 [S1]."),
    ],
    REVENUE_DOC,
  );
  expect(out.sections[0].claims).toEqual([
    { kind: "interpretation", text: "Apple revenue rose 6% and its margin hit 52.9% this quarter.", refs: ["W1"] },
    { kind: "interpretation", text: "EPS was $9.99.", refs: ["S1"] },
    { kind: "fact", text: "EPS was $6.08.", refs: ["S1"] },
  ]);
  expect(out.warnings).toContain("2 statements labelled as fact contain figures not found in their cited sources and are shown as interpretation.");
});

test("cited probabilities are kept as facts; only the model's own scores are removed", () => {
  const docs: ContextDoc[] = [{ id: "S1", title: "Fed funds futures", content: '{"decemberCutProbability":"70%"}' }];
  const out = parseAnalystMessage([text("[FACT] Futures price a 70% probability of a December cut [S1].\n[VIEW] There is a 60% chance stocks rally.")], docs);
  expect(out.sections[0].claims).toEqual([{ kind: "fact", text: "Futures price a 70% probability of a December cut.", refs: ["S1"] }]);
  expect(out.warnings).toEqual(["Removed 1 line that stated a confidence or probability score."]);
});
