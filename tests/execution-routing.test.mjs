import assert from "node:assert/strict";
import test from "node:test";
import {
  assessJobComplexity,
  createExecutionPlan,
  getRewardTier,
  listExecutionTiers
} from "../lib/execution-routing.mjs";

test("reward tiers select progressively stronger GPT-5.6 models and budgets", () => {
  assert.equal(getRewardTier(0.05).model, "gpt-5.6-luna");
  assert.equal(getRewardTier(0.1).model, "gpt-5.6-terra");
  assert.equal(getRewardTier(0.5).model, "gpt-5.6-sol");
  assert.equal(getRewardTier(2).reasoningEffort, "high");
  assert.equal(getRewardTier(2).outputVerbosity, "high");
  assert.equal(getRewardTier(10).reasoningMode, "pro");

  const tiers = listExecutionTiers();
  for (let index = 1; index < tiers.length; index += 1) {
    assert.ok(tiers[index].maxRuntimeMs > tiers[index - 1].maxRuntimeMs);
    assert.ok(tiers[index].maxOutputTokens > tiers[index - 1].maxOutputTokens);
  }
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
  assert.equal(underfunded.model, "gpt-5.6-luna");
  assert.equal(subsidized.budgetDecision, "subsidized");
  assert.equal(subsidized.model, "gpt-5.6-sol");
  assert.ok(subsidized.minimumRecommendedReward >= 2);
});

test("simple sufficiently funded work uses the paid service tier", () => {
  const plan = createExecutionPlan({
    title: "Rewrite a short product description",
    description: "Return concise ready-to-use copy.",
    rewardAmount: 0.5
  });

  assert.equal(plan.budgetDecision, "sufficient");
  assert.equal(plan.selectedTier, "pro");
  assert.equal(plan.model, "gpt-5.6-sol");
});
