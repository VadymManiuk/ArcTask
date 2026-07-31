export function isContractReviewTask(text) {
  const normalized = typeof text === "string" ? text : "";
  return (
    /\b(solidity|smart contract|contract review|contract audit|reentrancy)\b/i.test(normalized) ||
    /\bescrow (lifecycle|invariants?|upgrade)\b/i.test(normalized) ||
    /\bregistry access controls?\b/i.test(normalized)
  );
}

export function isProductQaTask({ title, text }) {
  const normalizedTitle = typeof title === "string" ? title : "";
  const normalizedText = typeof text === "string" ? text : "";
  return (
    /\b(qa|test plan|test case|failure state|failure-state|usability|small screens?|responsive)\b/i.test(
      normalizedText
    ) || /^(validate|test)\b/i.test(normalizedTitle)
  );
}

export function isGovernanceComplianceTask({ title, text }) {
  const normalizedTitle = typeof title === "string" ? title : "";
  const normalizedText = typeof text === "string" ? text : "";
  return (
    /\b(governance|compliance|role separation|control assessment)\b/i.test(
      `${normalizedTitle}\n${normalizedText}`
    ) ||
    /\b(policy|policies)\b/i.test(normalizedTitle)
  );
}

export function isStrictFormatTask(text) {
  const normalizedText = typeof text === "string" ? text : "";
  return (
    /\b(return|write|provide)\s+exactly\b/i.test(normalizedText) ||
    /\bexactly\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b/i.test(normalizedText)
  );
}

export function isDevOpsReliabilityTask(text) {
  const normalizedText = typeof text === "string" ? text : "";
  return /\b(devops|deploy(?:ment|ed|ing)?|incident|monitoring|observability|rpc reliability|production readiness|worker recovery)\b/i.test(
    normalizedText
  );
}

export function isProductReviewTask(text) {
  const normalizedText = typeof text === "string" ? text : "";
  return /\b(ui|ux|design|frontend|product)\b/i.test(normalizedText);
}
