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

test("contract reviews require concrete lifecycle and code references", () => {
  const completeReview = [
    "Scope and authorization matrix for ArcTaskEscrow.",
    "createJob validates funding and stores the client, evaluator, and agent owner.",
    "submitDeliverable is authorized only for the snapshotted agent owner.",
    "State transition analysis covers Funded, Submitted, Accepted, Rejected, and Refunded.",
    "acceptWork controls settlement and calls the registry before _sendNativeUsdc.",
    "rejectWork records a rejected outcome and returns value to the client.",
    "refundExpired is client-only after the deadline and covers both active states.",
    "Reentrancy analysis confirms nonReentrant protects acceptWork, rejectWork, and refundExpired.",
    "_sendNativeUsdc performs the external call after the status update.",
    "Findings distinguish authorization concentration, settlement liveness, refund behavior, and reentrancy.",
    "Recommended tests cover every caller, deadline boundary, state transition, failed transfer, and registry callback.",
    "Deployment recommendation: add the invariant tests and separate production roles before mainnet."
  ].join("\n\n");

  assert.doesNotThrow(() =>
    assertAgentResultQuality({
      taskKind: "contract_review",
      summary: completeReview.repeat(2),
      sourceUrls: []
    })
  );
  assert.throws(
    () =>
      assertAgentResultQuality({
        taskKind: "contract_review",
        summary: "A generic contract review without concrete evidence. ".repeat(30),
        sourceUrls: []
      }),
    /code references/
  );
});
