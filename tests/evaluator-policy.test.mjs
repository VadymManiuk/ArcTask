import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { actionForScore, validateReviewDecision } from "../lib/evaluator-policy.mjs";

test("evaluator threshold accepts seven and rejects six", () => {
  assert.equal(actionForScore(7), "accept");
  assert.equal(actionForScore(10), "accept");
  assert.equal(actionForScore(6), "reject");
  assert.equal(actionForScore(0), "reject");
});

test("review validation rejects an action that conflicts with its score", () => {
  assert.throws(
    () =>
      validateReviewDecision({
        jobId: "9",
        score: 6,
        action: "accept",
        deliverableHash: `0x${"a".repeat(64)}`,
        rationale: "This rationale is intentionally long enough."
      }),
    /conflicts with score/
  );
});

test("the recorded review file obeys the seven-of-ten settlement policy", () => {
  const review = JSON.parse(
    fs.readFileSync("reviews/job-quality-review-2026-07-29.json", "utf8")
  );

  for (const decision of review.decisions) {
    assert.doesNotThrow(() => validateReviewDecision(decision));
  }
});
