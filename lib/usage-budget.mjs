export function getUtcDayKey(nowMs = Date.now()) {
  return new Date(nowMs).toISOString().slice(0, 10);
}

export function getNextUtcDayIso(nowMs = Date.now()) {
  const now = new Date(nowMs);
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString();
}

export function normalizeUsageLedger(value) {
  const source = value && typeof value === "object" ? value : {};
  return {
    version: 1,
    days: source.days && typeof source.days === "object" ? source.days : {},
    jobs: source.jobs && typeof source.jobs === "object" ? source.jobs : {}
  };
}

function normalizeUsage(value) {
  return {
    inputTokens: Math.max(0, Number(value?.inputTokens ?? 0)),
    outputTokens: Math.max(0, Number(value?.outputTokens ?? 0)),
    totalTokens: Math.max(0, Number(value?.totalTokens ?? 0)),
    requests: Math.max(0, Number(value?.requests ?? 0))
  };
}

export function recordTokenUsage(ledgerValue, { jobId, inputTokens, outputTokens, totalTokens }, nowMs = Date.now()) {
  const ledger = normalizeUsageLedger(ledgerValue);
  const dayKey = getUtcDayKey(nowMs);
  const day = normalizeUsage(ledger.days[dayKey]);
  const job = normalizeUsage(ledger.jobs[jobId]);
  const delta = {
    inputTokens: Math.max(0, Number(inputTokens ?? 0)),
    outputTokens: Math.max(0, Number(outputTokens ?? 0)),
    totalTokens: Math.max(0, Number(totalTokens ?? 0))
  };

  ledger.days[dayKey] = {
    inputTokens: day.inputTokens + delta.inputTokens,
    outputTokens: day.outputTokens + delta.outputTokens,
    totalTokens: day.totalTokens + delta.totalTokens,
    requests: day.requests + 1
  };
  ledger.jobs[jobId] = {
    inputTokens: job.inputTokens + delta.inputTokens,
    outputTokens: job.outputTokens + delta.outputTokens,
    totalTokens: job.totalTokens + delta.totalTokens,
    requests: job.requests + 1,
    updatedAt: new Date(nowMs).toISOString()
  };
  return ledger;
}

export function getUsageBudgetState(
  ledgerValue,
  { jobId, dailyTokenBudget, jobTokenBudget },
  nowMs = Date.now()
) {
  const ledger = normalizeUsageLedger(ledgerValue);
  const day = normalizeUsage(ledger.days[getUtcDayKey(nowMs)]);
  const job = normalizeUsage(ledger.jobs[jobId]);
  return {
    daily: day,
    job,
    dailyExceeded: day.totalTokens >= dailyTokenBudget,
    jobExceeded: job.totalTokens >= jobTokenBudget,
    dailyRemaining: Math.max(0, dailyTokenBudget - day.totalTokens),
    jobRemaining: Math.max(0, jobTokenBudget - job.totalTokens)
  };
}
