import assert from "node:assert/strict";
import test from "node:test";
import {
  estimateTokenCostUsd,
  estimateUsageCostUsd,
  getMaxAffordableOutputTokens
} from "../lib/model-economics.mjs";

test("model cost estimates use configured input, cached input, and output rates", () => {
  assert.equal(
    estimateTokenCostUsd({
      model: "gpt-5.4-nano",
      inputTokens: 1_000,
      outputTokens: 1_000
    }),
    0.00145
  );
  assert.equal(
    estimateUsageCostUsd("gpt-5.6-luna", {
      input_tokens: 2_000,
      output_tokens: 1_000,
      input_tokens_details: { cached_tokens: 1_000 }
    }),
    0.0071
  );
});

test("affordable output calculation fails closed within the per-job USD budget", () => {
  const outputTokens = getMaxAffordableOutputTokens({
    model: "gpt-5.4-mini",
    inputTokens: 2_000,
    budgetUsd: 0.01
  });
  assert.equal(outputTokens, 1_888);
  assert.ok(
    estimateTokenCostUsd({
      model: "gpt-5.4-mini",
      inputTokens: 2_000,
      outputTokens
    }) <= 0.01
  );
});
