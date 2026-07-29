const supportedActions = new Set(["accept", "reject"]);

export function actionForScore(score) {
  if (!Number.isInteger(score) || score < 0 || score > 10) {
    throw new Error("Review score must be an integer from 0 to 10.");
  }

  return score >= 7 ? "accept" : "reject";
}

export function validateReviewDecision(review) {
  if (!review || typeof review !== "object") {
    throw new Error("Review decision must be an object.");
  }

  const jobId = String(review.jobId ?? "");
  if (!/^[1-9][0-9]*$/.test(jobId)) {
    throw new Error("Review jobId must be a positive integer string.");
  }

  if (!supportedActions.has(review.action)) {
    throw new Error(`Review ${jobId} has an unsupported action.`);
  }

  const expectedAction = actionForScore(review.score);
  if (review.action !== expectedAction) {
    throw new Error(
      `Review ${jobId} action ${review.action} conflicts with score ${review.score}; expected ${expectedAction}.`
    );
  }

  if (!/^0x[a-fA-F0-9]{64}$/.test(review.deliverableHash ?? "")) {
    throw new Error(`Review ${jobId} must include the exact deliverable hash.`);
  }

  if (typeof review.rationale !== "string" || review.rationale.trim().length < 20) {
    throw new Error(`Review ${jobId} must include a concrete rationale.`);
  }

  return {
    ...review,
    jobId,
    action: expectedAction,
    rationale: review.rationale.trim()
  };
}
