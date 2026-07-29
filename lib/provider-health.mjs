const quotaPatterns = [
  "exceeded your current quota",
  "insufficient_quota",
  "billing hard limit",
  "billing limit",
  "payment required"
];

function getErrorText(error) {
  if (error instanceof Error) {
    const cause = error.cause instanceof Error ? ` ${getErrorText(error.cause)}` : "";
    return `${error.message}${cause}`.toLowerCase();
  }

  return String(error ?? "").toLowerCase();
}

export function isProviderQuotaError(error) {
  const text = getErrorText(error);
  return quotaPatterns.some((pattern) => text.includes(pattern));
}

export function getProviderCooldownMs({
  consecutiveFailures,
  baseCooldownMs = 5 * 60_000,
  maxCooldownMs = 60 * 60_000
}) {
  const exponent = Math.max(0, Math.min(8, Number(consecutiveFailures || 1) - 1));
  return Math.min(maxCooldownMs, baseCooldownMs * 2 ** exponent);
}

export function createQuotaCooldown(previous, nowMs, options = {}) {
  const consecutiveFailures =
    previous?.code === "quota_exceeded" ? Number(previous.consecutiveFailures ?? 0) + 1 : 1;
  const cooldownMs = getProviderCooldownMs({
    consecutiveFailures,
    baseCooldownMs: options.baseCooldownMs,
    maxCooldownMs: options.maxCooldownMs
  });

  return {
    status: "paused",
    code: "quota_exceeded",
    message: "AI execution is paused because the model provider quota is unavailable.",
    consecutiveFailures,
    lastFailureAt: new Date(nowMs).toISOString(),
    retryAt: new Date(nowMs + cooldownMs).toISOString()
  };
}

export function isProviderCooldownActive(providerHealth, nowMs = Date.now()) {
  if (providerHealth?.status !== "paused") {
    return false;
  }

  const retryAtMs = Date.parse(providerHealth.retryAt ?? "");
  return Number.isFinite(retryAtMs) && retryAtMs > nowMs;
}
