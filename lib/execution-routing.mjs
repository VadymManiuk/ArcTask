const tierDefinitions = [
  {
    id: "starter",
    label: "Starter",
    minimumReward: 0.01,
    minimumComplexity: 0,
    model: "gpt-5.6-luna",
    reasoningEffort: "low",
    reasoningMode: null,
    outputVerbosity: "medium",
    maxRuntimeMs: 60_000,
    requestTimeoutMs: 55_000,
    maxOutputTokens: 2_000,
    maxTotalTokens: 4_000,
    maxRequests: 1,
    maxAttempts: 1,
    validationPasses: 0,
    webSearchContext: "low",
    minimumSources: 0
  },
  {
    id: "standard",
    label: "Standard",
    minimumReward: 0.1,
    minimumComplexity: 25,
    model: "gpt-5.6-terra",
    reasoningEffort: "medium",
    reasoningMode: null,
    outputVerbosity: "medium",
    maxRuntimeMs: 120_000,
    requestTimeoutMs: 55_000,
    maxOutputTokens: 4_000,
    maxTotalTokens: 8_000,
    maxRequests: 1,
    maxAttempts: 1,
    validationPasses: 0,
    webSearchContext: "medium",
    minimumSources: 2
  },
  {
    id: "pro",
    label: "Pro",
    minimumReward: 0.5,
    minimumComplexity: 50,
    model: "gpt-5.6-sol",
    reasoningEffort: "medium",
    reasoningMode: null,
    outputVerbosity: "medium",
    maxRuntimeMs: 240_000,
    requestTimeoutMs: 105_000,
    maxOutputTokens: 5_000,
    maxTotalTokens: 12_000,
    maxRequests: 1,
    maxAttempts: 1,
    validationPasses: 0,
    webSearchContext: "medium",
    minimumSources: 3
  },
  {
    id: "expert",
    label: "Expert",
    minimumReward: 2,
    minimumComplexity: 70,
    model: "gpt-5.6-sol",
    reasoningEffort: "high",
    reasoningMode: null,
    outputVerbosity: "high",
    maxRuntimeMs: 420_000,
    requestTimeoutMs: 135_000,
    maxOutputTokens: 7_000,
    maxTotalTokens: 18_000,
    maxRequests: 2,
    maxAttempts: 1,
    validationPasses: 1,
    webSearchContext: "high",
    minimumSources: 4
  },
  {
    id: "critical",
    label: "Critical",
    minimumReward: 10,
    minimumComplexity: 90,
    model: "gpt-5.6-sol",
    reasoningEffort: "xhigh",
    reasoningMode: "pro",
    outputVerbosity: "high",
    maxRuntimeMs: 900_000,
    requestTimeoutMs: 240_000,
    maxOutputTokens: 10_000,
    maxTotalTokens: 30_000,
    maxRequests: 2,
    maxAttempts: 2,
    validationPasses: 1,
    webSearchContext: "high",
    minimumSources: 5
  }
];

const factorDefinitions = [
  {
    id: "high_risk",
    label: "Financial or security risk",
    points: 25,
    pattern:
      /\b(escrow|contract|solidity|audit|security|vulnerab|reentran|payment|treasury|invoice|settlement|refund|authorization|wallet risk)\b/i
  },
  {
    id: "fresh_evidence",
    label: "Current evidence and primary sources",
    points: 20,
    pattern:
      /\b(research|source|verify|current|latest|active|market|ecosystem|opportunit|compare|benchmark|tge|news|evidence)\b/i
  },
  {
    id: "code_or_artifacts",
    label: "Code, contracts, or supplied artifacts",
    points: 15,
    pattern: /\b(code|contract|solidity|abi|repository|github|file|attachment|implementation|frontend|backend|api)\b/i
  },
  {
    id: "multi_step",
    label: "Multi-step or comparative output",
    points: 15,
    pattern:
      /\b(compare|map|review|analy[sz]e|identify.+and|explain.+and|findings|recommendations|invariants|risks|acceptance criteria)\b/i
  },
  {
    id: "external_tools",
    label: "External tools or web access",
    points: 10,
    pattern: /\b(web|website|url|link|source|onchain|transaction|explorer|rpc|deploy|test)\b/i
  }
];

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function copyTier(tier) {
  return { ...tier };
}

export function listExecutionTiers() {
  return tierDefinitions.map(copyTier);
}

export function assessJobComplexity(input) {
  const title = normalizeText(input?.title);
  const description = normalizeText(input?.description);
  const text = `${title}\n${description}`.trim();
  const factors = [];
  let score = 10;

  for (const factor of factorDefinitions) {
    if (factor.pattern.test(text)) {
      score += factor.points;
      factors.push({
        id: factor.id,
        label: factor.label,
        points: factor.points
      });
    }
  }

  if (description.length >= 500) {
    score += 10;
    factors.push({ id: "large_scope", label: "Large task scope", points: 10 });
  } else if (description.length >= 220) {
    score += 5;
    factors.push({ id: "medium_scope", label: "Detailed task scope", points: 5 });
  }

  if (description.length > 0 && description.length < 60) {
    score += 5;
    factors.push({ id: "ambiguity", label: "Short or ambiguous brief", points: 5 });
  }

  const normalizedScore = clamp(score, 0, 100);
  const requiredTier =
    [...tierDefinitions].reverse().find((tier) => normalizedScore >= tier.minimumComplexity) ?? tierDefinitions[0];

  return {
    score: normalizedScore,
    band: requiredTier.id,
    label: requiredTier.label,
    factors
  };
}

export function getRewardTier(rewardAmount) {
  const normalizedReward = Number.isFinite(Number(rewardAmount)) ? Math.max(0, Number(rewardAmount)) : 0;
  return copyTier(
    [...tierDefinitions].reverse().find((tier) => normalizedReward >= tier.minimumReward) ?? tierDefinitions[0]
  );
}

export function createExecutionPlan(input, options = {}) {
  const rewardAmount = Number.isFinite(Number(input?.rewardAmount)) ? Math.max(0, Number(input.rewardAmount)) : 0;
  const complexity = assessJobComplexity(input);
  const requiredTierIndex = tierDefinitions.findIndex((tier) => tier.id === complexity.band);
  const affordableTierIndex = tierDefinitions.reduce(
    (selectedIndex, tier, index) => (rewardAmount >= tier.minimumReward ? index : selectedIndex),
    0
  );
  const isSufficient = rewardAmount >= tierDefinitions[requiredTierIndex].minimumReward;
  const isSubsidized = !isSufficient && options.allowSubsidy === true;
  const selectedTierIndex = isSubsidized ? requiredTierIndex : affordableTierIndex;
  const selectedTier = tierDefinitions[selectedTierIndex];
  const requiredTier = tierDefinitions[requiredTierIndex];
  const affordableTier = tierDefinitions[affordableTierIndex];

  return {
    version: 1,
    complexity,
    rewardAmount,
    rewardTier: affordableTier.id,
    requiredTier: requiredTier.id,
    selectedTier: selectedTier.id,
    budgetDecision: isSufficient ? "sufficient" : isSubsidized ? "subsidized" : "insufficient",
    minimumRecommendedReward: requiredTier.minimumReward,
    model: selectedTier.model,
    reasoningEffort: selectedTier.reasoningEffort,
    reasoningMode: selectedTier.reasoningMode,
    outputVerbosity: selectedTier.outputVerbosity,
    maxRuntimeMs: selectedTier.maxRuntimeMs,
    requestTimeoutMs: selectedTier.requestTimeoutMs,
    maxOutputTokens: selectedTier.maxOutputTokens,
    maxTotalTokens: selectedTier.maxTotalTokens,
    maxRequests: selectedTier.maxRequests,
    maxAttempts: selectedTier.maxAttempts,
    validationPasses: selectedTier.validationPasses,
    webSearchContext: selectedTier.webSearchContext,
    minimumSources: selectedTier.minimumSources
  };
}

export function formatRuntime(maxRuntimeMs) {
  const seconds = Math.round(maxRuntimeMs / 1_000);
  if (seconds < 60) {
    return `${seconds} sec`;
  }

  const minutes = Math.round(seconds / 60);
  return `${minutes} min`;
}
