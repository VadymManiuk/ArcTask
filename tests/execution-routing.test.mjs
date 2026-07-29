import assert from "node:assert/strict";
import test from "node:test";
import {
  assessJobComplexity,
  createExecutionPlan,
  getRewardTier,
  listExecutionTiers
} from "../lib/execution-routing.mjs";

test("reward ceilings expose progressively stronger models and budgets", () => {
  assert.equal(getRewardTier(0.05).model, "gpt-5.4-nano");
  assert.equal(getRewardTier(0.1).model, "gpt-5.4-mini");
  assert.equal(getRewardTier(0.5).model, "gpt-5.6-luna");
  assert.equal(getRewardTier(2).model, "gpt-5.6-terra");
  assert.equal(getRewardTier(2).reasoningEffort, "high");
  assert.equal(getRewardTier(2).outputVerbosity, "high");
  assert.equal(getRewardTier(10).reasoningMode, "pro");

  const tiers = listExecutionTiers();
  for (let index = 1; index < tiers.length; index += 1) {
    assert.ok(tiers[index].maxRuntimeMs > tiers[index - 1].maxRuntimeMs);
    assert.ok(tiers[index].maxOutputTokens > tiers[index - 1].maxOutputTokens);
    assert.ok(tiers[index].maxTotalTokens > tiers[index - 1].maxTotalTokens);
  }
  assert.ok(tiers.every((tier) => tier.maxRequests <= 2));
});

test("contract security review requires at least an expert execution tier", () => {
  const complexity = assessJobComplexity({
    title: "Review escrow contract invariants",
    description:
      "Review Solidity source and ABI, analyze authorization, settlement, refund and reentrancy risks, then provide severity-ranked findings and tests."
  });

  assert.ok(complexity.score >= 70);
  assert.ok(["expert", "critical"].includes(complexity.band));
});

test("underfunded complex jobs fail closed unless explicitly subsidized", () => {
  const job = {
    title: "Audit escrow contract",
    description:
      "Review Solidity source and ABI, verify security, authorization, settlement, refund and reentrancy invariants with concrete findings.",
    rewardAmount: 0.05
  };
  const underfunded = createExecutionPlan(job);
  const subsidized = createExecutionPlan(job, { allowSubsidy: true });

  assert.equal(underfunded.budgetDecision, "insufficient");
  assert.equal(underfunded.model, "gpt-5.4-nano");
  assert.equal(subsidized.budgetDecision, "subsidized");
  assert.equal(subsidized.model, "gpt-5.6-sol");
  assert.ok(subsidized.minimumRecommendedReward >= 2);
});

test("a large reward is only a ceiling and does not force an expensive model", () => {
  const plan = createExecutionPlan({
    title: "Rewrite a short product description",
    description: "Return concise ready-to-use copy.",
    rewardAmount: 10
  });

  assert.equal(plan.budgetDecision, "sufficient");
  assert.equal(plan.selectedTier, "starter");
  assert.equal(plan.model, "gpt-5.4-nano");
  assert.equal(plan.serviceTier, "flex");
  assert.equal(plan.computeBudgetUsd, 2);
});

test("high-confidence AI assessment selects the smallest safe tier and bounded parameters", () => {
  const plan = createExecutionPlan(
    {
      title: "Prepare an integration report",
      description: "Document the supplied API behavior and acceptance criteria.",
      rewardAmount: 2
    },
    {
      minimumTier: "standard",
      aiAssessment: {
        score: 54,
        risk: "medium",
        recommendedTier: "pro",
        reasoningEffort: "medium",
        estimatedOutputTokens: 2_200,
        maxRequests: 1,
        confidence: 0.91,
        reason: "Multi-step integration report"
      }
    }
  );

  assert.equal(plan.routingSource, "ai");
  assert.equal(plan.selectedTier, "pro");
  assert.equal(plan.model, "gpt-5.6-luna");
  assert.equal(plan.maxOutputTokens, 2_500);
  assert.equal(plan.maxRequests, 2);
});

test("AI tier choice is not inflated by a borderline score when confidence is high", () => {
  const plan = createExecutionPlan(
    {
      title: "Analyze marketplace activity",
      description: "Calculate the requested marketplace metrics from supplied evidence.",
      rewardAmount: 0.5
    },
    {
      minimumTier: "standard",
      aiAssessment: {
        score: 78,
        risk: "medium",
        recommendedTier: "pro",
        reasoningEffort: "medium",
        estimatedOutputTokens: 650,
        maxRequests: 1,
        confidence: 0.9,
        reason: "Bounded data analysis"
      }
    }
  );

  assert.equal(plan.selectedTier, "pro");
  assert.equal(plan.budgetDecision, "sufficient");
  assert.equal(plan.maxOutputTokens, 2_500);
  assert.equal(plan.maxRequests, 2);
});

test("AI recommendations cannot bypass risk or deterministic minimum-tier policy", () => {
  const plan = createExecutionPlan(
    {
      title: "Review escrow authorization",
      description: "Review the supplied contract.",
      rewardAmount: 10
    },
    {
      minimumTier: "expert",
      aiAssessment: {
        score: 10,
        risk: "low",
        recommendedTier: "starter",
        reasoningEffort: "low",
        estimatedOutputTokens: 500,
        maxRequests: 1,
        confidence: 0.99,
        reason: "Untrusted downgrade"
      }
    }
  );

  assert.equal(plan.selectedTier, "expert");
  assert.equal(plan.model, "gpt-5.6-terra");
  assert.equal(plan.maxOutputTokens, 4_000);
});
