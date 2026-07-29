import assert from "node:assert/strict";
import test from "node:test";
import {
  isContractReviewTask,
  isGovernanceComplianceTask,
  isProductQaTask
} from "../lib/task-routing.mjs";

test("CCTP contract boundaries route as integration rather than contract review", () => {
  assert.equal(
    isContractReviewTask(
      "Design a CCTP settlement integration covering APIs, contract boundaries, authentication, validation, and retries."
    ),
    false
  );
  assert.equal(
    isContractReviewTask(
      "Perform a critical Solidity security review of the escrow upgrade path and reentrancy invariants."
    ),
    true
  );
});

test("QA routing requires a QA-shaped task rather than any validation mention", () => {
  assert.equal(
    isProductQaTask({
      title: "Design a CCTP settlement integration",
      text: "Define API validation, retries, and rollout."
    }),
    false
  );
  assert.equal(
    isProductQaTask({
      title: "Validate mobile marketplace UX",
      text: "Review responsive behavior on small screens."
    }),
    true
  );
});

test("technical retry policies do not route as governance work", () => {
  assert.equal(
    isGovernanceComplianceTask({
      title: "Design a resilient CCTP recovery pipeline",
      text: "Define attestation polling, retry and backoff policy, replay protection, monitoring, and rollout."
    }),
    false
  );
  assert.equal(
    isGovernanceComplianceTask({
      title: "Design marketplace governance controls",
      text: "Map roles, conflicts of interest, evidence retention, and exception handling."
    }),
    true
  );
});
