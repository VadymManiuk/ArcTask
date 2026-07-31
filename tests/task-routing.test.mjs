import assert from "node:assert/strict";
import test from "node:test";
import {
  isContractReviewTask,
  isDevOpsReliabilityTask,
  isGovernanceComplianceTask,
  isProductQaTask,
  isProductReviewTask,
  isStrictFormatTask
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

test("exact-format tasks are detected without forcing a long report", () => {
  assert.equal(
    isStrictFormatTask(
      "Return exactly five concise bullets in lifecycle order, followed by one sentence."
    ),
    true
  );
  assert.equal(
    isStrictFormatTask("Return a concise lifecycle report with evidence and recommendations."),
    false
  );
});

test("production worker recovery routes as DevOps rather than product review", () => {
  const text =
    "Review the production deploy and worker recovery path for stale locks, RPC failure, rollback, and retry budgets.";

  assert.equal(isDevOpsReliabilityTask(text), true);
  assert.equal(isProductReviewTask(text), false);
  assert.equal(isProductReviewTask("Review the frontend product UX."), true);
});
