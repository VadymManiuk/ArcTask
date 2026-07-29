import { estimateTokenCostUsd } from "./model-economics.mjs";

const tierDefinitions = [
  {
    id: "starter",
    label: "Starter",
    minimumReward: 0.01,
    minimumComplexity: 0,
    model: "gpt-5.4-nano",
    reasoningEffort: "low",
    reasoningMode: null,
    outputVerbosity: "medium",
    maxRuntimeMs: 60_000,
    requestTimeoutMs: 55_000,
    minimumOutputTokens: 900,
    maxOutputTokens: 1_500,
    maxTotalTokens: 3_000,
    maxRequests: 1,
    maxAttempts: 1,
    validationPasses: 0,
    webSearchContext: "low",
    minimumSources: 0,
    computeBudgetShare: 0.2
  },
  {
    id: "standard",
    label: "Standard",
    minimumReward: 0.1,
    minimumComplexity: 25,
    model: "gpt-5.4-mini",
    reasoningEffort: "medium",
    reasoningMode: null,
    outputVerbosity: "medium",
    maxRuntimeMs: 120_000,
    requestTimeoutMs: 55_000,
    minimumOutputTokens: 2_000,
    maxOutputTokens: 3_500,
    maxTotalTokens: 8_000,
    maxRequests: 1,
    maxAttempts: 1,
    validationPasses: 0,
    webSearchContext: "medium",
    minimumSources: 2,
    computeBudgetShare: 0.22
  },
  {
    id: "pro",
    label: "Pro",
    minimumReward: 0.5,
    minimumComplexity: 50,
    model: "gpt-5.6-luna",
    reasoningEffort: "medium",
    reasoningMode: null,
    outputVerbosity: "medium",
    maxRuntimeMs: 240_000,
    requestTimeoutMs: 105_000,
    minimumOutputTokens: 6_000,
    maxOutputTokens: 8_000,
    maxTotalTokens: 60_000,
    maxRequests: 2,
    maxAttempts: 2,
    validationPasses: 0,
    webSearchContext: "medium",
    minimumSources: 3,
    computeBudgetShare: 0.25
  },
  {
    id: "expert",
    label: "Expert",
    minimumReward: 2,
    minimumComplexity: 70,
    model: "gpt-5.6-terra",
    reasoningEffort: "high",
    reasoningMode: null,
    outputVerbosity: "high",
    maxRuntimeMs: 420_000,
    requestTimeoutMs: 135_000,
    minimumOutputTokens: 9_000,
    maxOutputTokens: 12_000,
    maxTotalTokens: 90_000,
    maxRequests: 2,
    maxAttempts: 2,
    validationPasses: 0,
    webSearchContext: "medium",
    minimumSources: 4,
    computeBudgetShare: 0.3
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
    minimumOutputTokens: 14_000,
    maxOutputTokens: 20_000,
    maxTotalTokens: 150_000,
    maxRequests: 2,
    maxAttempts: 2,
    validationPasses: 0,
    webSearchContext: "high",
    minimumSources: 5,
    computeBudgetShare: 0.35
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

function getTierIndex(tierId, fallback = 0) {
  const index = tierDefinitions.findIndex((tier) => tier.id === tierId);
  return index === -1 ? fallback : index;
}

function normalizeReasoningEffort(value, fallback) {
  return ["low", "medium", "high", "xhigh"].includes(value) ? value : fallback;
}

function normalizeFiniteNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function selectReasoningEffort(assessment, tierEffort) {
  if (!assessment) {
    return tierEffort;
  }

  const levels = ["low", "medium", "high", "xhigh"];
  const requestedIndex = levels.indexOf(normalizeReasoningEffort(assessment.reasoningEffort, tierEffort));
  const maximumIndex = levels.indexOf(tierEffort);
  const minimumIndex = assessment.risk === "critical" || assessment.risk === "high"
    ? levels.indexOf("high")
    : 0;
  return levels[clamp(requestedIndex, minimumIndex, maximumIndex)];
}

export function normalizeAiRoutingAssessment(value) {
  const source = value && typeof value === "object" ? value : {};
  const recommendedTier = tierDefinitions.some((tier) => tier.id === source.recommendedTier)
    ? source.recommendedTier
    : undefined;
  const risk = ["low", "medium", "high", "critical"].includes(source.risk)
    ? source.risk
    : "medium";
  const score = clamp(Math.round(normalizeFiniteNumber(source.score, 50)), 0, 100);
  const estimatedOutputTokens = clamp(
    Math.round(normalizeFiniteNumber(source.estimatedOutputTokens, 2_000)),
    500,
    10_000
  );
  const maxRequests = clamp(Math.round(normalizeFiniteNumber(source.maxRequests, 1)), 1, 2);
  const confidence = clamp(normalizeFiniteNumber(source.confidence, 0), 0, 1);
  const reason = normalizeText(source.reason).slice(0, 240);

  return {
    score,
    risk,
    recommendedTier,
    reasoningEffort: normalizeReasoningEffort(source.reasoningEffort, "medium"),
    estimatedOutputTokens,
    maxRequests,
    needsWebSearch: source.needsWebSearch === true,
    needsCodeAnalysis: source.needsCodeAnalysis === true,
    confidence,
    reason
  };
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
  const deterministicComplexity = assessJobComplexity(input);
  const aiAssessment = options.aiAssessment
    ? normalizeAiRoutingAssessment(options.aiAssessment)
    : null;
  const deterministicTierIndex = getTierIndex(deterministicComplexity.band);
  const minimumTierIndex = getTierIndex(options.minimumTier, 0);
  let requiredTierIndex = deterministicTierIndex;

  if (aiAssessment) {
    const scoreTier = [...tierDefinitions]
      .map((tier, index) => ({ tier, index }))
      .reverse()
      .find(({ tier }) => aiAssessment.score >= tier.minimumComplexity)?.index ?? 0;
    const recommendedTierIndex = aiAssessment.recommendedTier
      ? getTierIndex(aiAssessment.recommendedTier, scoreTier)
      : scoreTier;
    // The score is useful telemetry, but the router's explicit tier decision is
    // more precise than mapping a borderline numeric score to a more expensive
    // model. Deterministic policy still wins when AI confidence is low.
    const aiTierIndex = recommendedTierIndex;
    requiredTierIndex =
      aiAssessment.confidence >= 0.65
        ? aiTierIndex
        : Math.max(deterministicTierIndex, aiTierIndex);
    if (aiAssessment.risk === "high") {
      requiredTierIndex = Math.max(requiredTierIndex, getTierIndex("expert"));
    } else if (aiAssessment.risk === "critical") {
      requiredTierIndex = Math.max(requiredTierIndex, getTierIndex("critical"));
    }
  }

  requiredTierIndex = Math.max(requiredTierIndex, minimumTierIndex);
  const requiredTierForComplexity = tierDefinitions[requiredTierIndex];
  const complexity = aiAssessment
    ? {
        score: Math.max(aiAssessment.score, requiredTierForComplexity.minimumComplexity),
        band: requiredTierForComplexity.id,
        label: requiredTierForComplexity.label,
        factors: [
          ...deterministicComplexity.factors,
          {
            id: "ai_assessment",
            label: aiAssessment.reason || "AI complexity assessment",
            points: 0
          }
        ]
      }
    : deterministicComplexity;
  const affordableTierIndex = tierDefinitions.reduce(
    (selectedIndex, tier, index) => (rewardAmount >= tier.minimumReward ? index : selectedIndex),
    0
  );
  const isSufficient = rewardAmount >= tierDefinitions[requiredTierIndex].minimumReward;
  const isSubsidized = !isSufficient && options.allowSubsidy === true;
  const selectedTierIndex = isSufficient || isSubsidized ? requiredTierIndex : affordableTierIndex;
  const selectedTier = tierDefinitions[selectedTierIndex];
  const requiredTier = tierDefinitions[requiredTierIndex];
  const affordableTier = tierDefinitions[affordableTierIndex];
  const budgetReward = isSubsidized ? Math.max(rewardAmount, requiredTier.minimumReward) : rewardAmount;
  const computeBudgetUsd = Number((budgetReward * selectedTier.computeBudgetShare).toFixed(6));
  const maxOutputTokens = aiAssessment
    ? clamp(
        aiAssessment.estimatedOutputTokens,
        selectedTier.minimumOutputTokens,
        selectedTier.maxOutputTokens
      )
    : selectedTier.maxOutputTokens;
  // A retry is only spent after a failed quality check. Keeping the tier's
  // allowance prevents a truncated first response from permanently stranding
  // a funded job while the per-job token and USD ceilings remain authoritative.
  const maxRequests = selectedTier.maxRequests;
  const maxAttempts = Math.min(selectedTier.maxAttempts, maxRequests);
  const estimatedMaximumCostUsd = estimateTokenCostUsd({
    model: selectedTier.model,
    inputTokens: Math.max(1_000, selectedTier.maxTotalTokens - maxOutputTokens),
    outputTokens: maxOutputTokens
  });

  return {
    version: 3,
    complexity,
    routingSource: aiAssessment ? "ai" : "deterministic",
    aiAssessment,
    rewardAmount,
    rewardTier: affordableTier.id,
    requiredTier: requiredTier.id,
    selectedTier: selectedTier.id,
    budgetDecision: isSufficient ? "sufficient" : isSubsidized ? "subsidized" : "insufficient",
    minimumRecommendedReward: requiredTier.minimumReward,
    computeBudgetUsd,
    computeBudgetShare: selectedTier.computeBudgetShare,
    estimatedMaximumCostUsd,
    model: selectedTier.model,
    reasoningEffort: selectReasoningEffort(aiAssessment, selectedTier.reasoningEffort),
    reasoningMode: selectedTier.reasoningMode,
    outputVerbosity: selectedTier.outputVerbosity,
    maxRuntimeMs: selectedTier.maxRuntimeMs,
    requestTimeoutMs: selectedTier.requestTimeoutMs,
    maxOutputTokens,
    maxTotalTokens: selectedTier.maxTotalTokens,
    maxRequests,
    maxAttempts,
    validationPasses: 0,
    // Quality retries keep the selected model and reduce reasoning effort. This
    // leaves more of the fixed USD budget for a complete visible deliverable.
    escalationModel: null,
    serviceTier: selectedTierIndex <= getTierIndex("pro") ? "flex" : "default",
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
