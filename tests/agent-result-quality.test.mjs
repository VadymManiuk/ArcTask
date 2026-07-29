import assert from "node:assert/strict";
import test from "node:test";
import {
  appendSourceUrls,
  assertAgentResultQuality,
  collectOpenAiSourceUrls
} from "../scripts/agent-result-quality.mjs";

test("OpenAI source annotations are preserved in the deliverable", () => {
  const body = {
    output: [
      {
        content: [
          {
            annotations: [
              { type: "url_citation", url: "https://example.com/one" },
              { type: "url_citation", url_citation: { url: "https://example.com/two" } }
            ]
          }
        ]
      }
    ]
  };

  const urls = collectOpenAiSourceUrls(body, "See https://example.com/three for context.");
  assert.deepEqual(urls, [
    "https://example.com/three",
    "https://example.com/one",
    "https://example.com/two"
  ]);
  assert.match(appendSourceUrls("A sufficiently detailed result.", urls), /Sources:/);
});

test("research deliverables fail closed without enough sources", () => {
  assert.throws(
    () =>
      assertAgentResultQuality({
        taskKind: "market_research",
        summary:
          "This is a concrete research result with detailed findings, opportunity analysis, risk analysis, evidence notes, and a specific recommendation. ".repeat(
            3
          ),
        sourceUrls: ["https://example.com/one", "https://example.com/two"]
      }),
    /at least 3/
  );
});

test("placeholder deliverables are rejected before onchain submission", () => {
  assert.throws(
    () =>
      assertAgentResultQuality({
        taskKind: "general_task",
        summary:
          "No external evidence, links, files, or evaluator notes were provided beyond the payload. ".repeat(4),
        sourceUrls: []
      }),
    /placeholder/
  );
});
