import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { validateReviewDecision } from "../lib/evaluator-policy.mjs";

test("review validation accepts an explicit supported action without a score", () => {
  const decision = validateReviewDecision({
    jobId: "9",
    action: "accept",
    deliverableHash: `0x${"a".repeat(64)}`,
    rationale: "This rationale is intentionally long enough."
  });

  assert.equal(decision.action, "accept");
  assert.equal("score" in decision, false);
});

test("review validation rejects an unsupported action", () => {
  assert.throws(
    () =>
      validateReviewDecision({
        jobId: "9",
        action: "hold",
        deliverableHash: `0x${"a".repeat(64)}`,
        rationale: "This rationale is intentionally long enough."
      }),
    /unsupported action/
  );
});

test("the recorded review file contains explicit qualitative decisions", () => {
  const review = JSON.parse(
    fs.readFileSync("reviews/job-quality-review-2026-07-29.json", "utf8")
  );

  assert.equal("threshold" in review, false);
  assert.equal("rubric" in review, false);
  for (const decision of review.decisions) {
    assert.doesNotThrow(() => validateReviewDecision(decision));
    assert.equal("score" in decision, false);
  }
});
