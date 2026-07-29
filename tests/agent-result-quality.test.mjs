import assert from "node:assert/strict";
import test from "node:test";
import {
  appendSourceUrls,
  assertAgentResultQuality,
  collectOpenAiSourceUrls,
  completionMarker,
  stripCompletionMarker
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

test("completion marker survives source appending and is removed before publication", () => {
  const summary = `Complete evidence-backed result.\n\n${completionMarker}`;
  const withSources = appendSourceUrls(summary, ["https://example.com/source"]);

  assert.equal(withSources.endsWith(completionMarker), true);
  assert.match(withSources, /Sources:/);
  assert.equal(stripCompletionMarker(withSources).includes(completionMarker), false);
  assert.throws(
    () =>
      assertAgentResultQuality({
        taskKind: "general_task",
        summary: "A detailed but truncated result. ".repeat(20),
        sourceUrls: [],
        requireCompletionMarker: true
      }),
    /incomplete or truncated/
  );
});

test("malformed markdown-backtick URLs are not accepted as sources", () => {
  assert.deepEqual(
    collectOpenAiSourceUrls({}, "Bad https://docs.arc.network/` and good https://docs.arc.network/guide"),
    ["https://docs.arc.network/guide"]
  );
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

test("quality topics accept clear semantic equivalents instead of brittle headings", () => {
  const summary = [
    "Marketplace snapshot and source fields define the cohort inputs.",
    "Formula, numerator, denominator, threshold, and validation query are specified.",
    "Unavailable history is a material data gap, so the conclusion is bounded to the reference block."
  ].join("\n\n");

  assert.doesNotThrow(() =>
    assertAgentResultQuality({
      taskKind: "data_analysis",
      summary,
      sourceUrls: [],
      requiredTopics: [
        "data source",
        "formula",
        "numerator",
        "denominator",
        "threshold",
        "validation",
        "limitation"
      ]
    })
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

test("wallet risk assessments must use the supplied Arc RPC and transaction evidence", () => {
  const transactionHash = `0x${"a".repeat(64)}`;
  const evidence = {
    available: true,
    subjectWallet: "0x7B42ED8165710a86684a54E8B02ec0f61Da8C897",
    network: { chainId: 5_042_002 },
    rpcSnapshot: {
      referenceBlock: "54242998",
      sentTransactionCount: 128,
      accountType: "eoa"
    },
    explorerEvidence: {
      transactionSample: {
        transactions: [{ hash: transactionHash }]
      }
    }
  };
  const validSummary = [
    "Recommendation: HOLD pending ownership verification.",
    `Verified wallet: ${evidence.subjectWallet}`,
    "Verified Arc Testnet chain ID: 5042002.",
    "Reference block: 54242998. Account type: EOA. Sent transaction count: 128.",
    `Recent transaction evidence includes ${transactionHash}, an outgoing contract call.`,
    "Ownership evidence: the role assignment does not prove current control.",
    "Severity-ranked findings: High verification gap; Medium role concentration.",
    "Evidence limitations: the explorer label is not sanctions or AML clearance.",
    "Final recommendation: require a signed challenge and independent vendor identity verification.",
    "This conclusion distinguishes confirmed facts, risk indicators, and missing proof.",
    "The observed balance, nonce, account type, and successful contract call demonstrate activity on Arc Testnet, but they do not prove the vendor's legal identity, beneficial ownership, sanctions status, or entitlement to receive payment.",
    "The evaluator should preserve the reference block and transaction sample, issue a fresh domain-bound signature challenge, verify the signer through an independent vendor channel, and repeat the screening immediately before approving an address allowlist change."
  ].join("\n\n");

  assert.doesNotThrow(() =>
    assertAgentResultQuality({
      taskKind: "wallet_or_counterparty_risk",
      summary: validSummary,
      sourceUrls: [],
      evidence
    })
  );

  assert.throws(
    () =>
      assertAgentResultQuality({
        taskKind: "wallet_or_counterparty_risk",
        summary:
          "The intended blockchain is not identified. Transaction and counterparty risk is unassessed. " +
          "Request generic ownership documents before onboarding.".repeat(20),
        sourceUrls: [],
        evidence
      }),
    /omitted verified evidence|contradicts/
  );
});
