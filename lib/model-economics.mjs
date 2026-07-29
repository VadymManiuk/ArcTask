const modelPricing = {
  "gpt-5.4-nano": {
    inputUsdPerMillion: 0.2,
    cachedInputUsdPerMillion: 0.02,
    cacheWriteUsdPerMillion: 0.2,
    outputUsdPerMillion: 1.25
  },
  "gpt-5.4-mini": {
    inputUsdPerMillion: 0.75,
    cachedInputUsdPerMillion: 0.075,
    cacheWriteUsdPerMillion: 0.75,
    outputUsdPerMillion: 4.5
  },
  "gpt-5.6-luna": {
    inputUsdPerMillion: 1,
    cachedInputUsdPerMillion: 0.1,
    cacheWriteUsdPerMillion: 1.25,
    outputUsdPerMillion: 6
  },
  "gpt-5.6-terra": {
    inputUsdPerMillion: 2.5,
    cachedInputUsdPerMillion: 0.25,
    cacheWriteUsdPerMillion: 3.125,
    outputUsdPerMillion: 15
  },
  "gpt-5.6-sol": {
    inputUsdPerMillion: 5,
    cachedInputUsdPerMillion: 0.5,
    cacheWriteUsdPerMillion: 6.25,
    outputUsdPerMillion: 30
  }
};

function normalizeTokenCount(value) {
  return Math.max(0, Number.isFinite(Number(value)) ? Number(value) : 0);
}

export function getModelPricing(model) {
  const pricing = modelPricing[model];
  if (!pricing) {
    throw new Error(`No token pricing is configured for model ${model}.`);
  }

  return { ...pricing };
}

export function estimateTokenCostUsd({
  model,
  inputTokens = 0,
  outputTokens = 0,
  cachedInputTokens = 0,
  cacheWriteTokens = 0
}) {
  const pricing = getModelPricing(model);
  const totalInputTokens = normalizeTokenCount(inputTokens);
  const cachedTokens = Math.min(totalInputTokens, normalizeTokenCount(cachedInputTokens));
  const writeTokens = Math.min(
    Math.max(0, totalInputTokens - cachedTokens),
    normalizeTokenCount(cacheWriteTokens)
  );
  const uncachedTokens = Math.max(0, totalInputTokens - cachedTokens - writeTokens);
  const cost =
    (uncachedTokens * pricing.inputUsdPerMillion +
      cachedTokens * pricing.cachedInputUsdPerMillion +
      writeTokens * pricing.cacheWriteUsdPerMillion +
      normalizeTokenCount(outputTokens) * pricing.outputUsdPerMillion) /
    1_000_000;

  return Number(cost.toFixed(8));
}

export function estimateUsageCostUsd(model, usage) {
  const inputDetails = usage?.input_tokens_details ?? {};
  return estimateTokenCostUsd({
    model,
    inputTokens: usage?.input_tokens,
    outputTokens: usage?.output_tokens,
    cachedInputTokens: inputDetails.cached_tokens,
    cacheWriteTokens: inputDetails.cache_write_tokens
  });
}

export function getMaxAffordableOutputTokens({ model, inputTokens, budgetUsd }) {
  const pricing = getModelPricing(model);
  const inputCost = estimateTokenCostUsd({ model, inputTokens });
  const remainingUsd = Math.max(0, Number(budgetUsd ?? 0) - inputCost);
  return Math.max(0, Math.floor((remainingUsd * 1_000_000) / pricing.outputUsdPerMillion));
}

export function listModelPricing() {
  return Object.fromEntries(
    Object.entries(modelPricing).map(([model, pricing]) => [model, { ...pricing }])
  );
}
