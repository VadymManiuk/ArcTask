import assert from "node:assert/strict";
import test from "node:test";
import { isContractReviewTask, isProductQaTask } from "../lib/task-routing.mjs";

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
