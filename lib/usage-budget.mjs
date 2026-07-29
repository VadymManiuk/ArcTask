export function getUtcDayKey(nowMs = Date.now()) {
  return new Date(nowMs).toISOString().slice(0, 10);
}

export function getUtcMonthKey(nowMs = Date.now()) {
  return new Date(nowMs).toISOString().slice(0, 7);
}

export function getNextUtcMonthIso(nowMs = Date.now()) {
  const now = new Date(nowMs);
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();
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
  const requestKinds = value?.requestKinds && typeof value.requestKinds === "object"
    ? value.requestKinds
    : {};
  return {
    inputTokens: Math.max(0, Number(value?.inputTokens ?? 0)),
    outputTokens: Math.max(0, Number(value?.outputTokens ?? 0)),
    totalTokens: Math.max(0, Number(value?.totalTokens ?? 0)),
    requests: Math.max(0, Number(value?.requests ?? 0)),
    costUsd: Math.max(0, Number(value?.costUsd ?? 0)),
    policyVersion: Math.max(0, Number(value?.policyVersion ?? 0)),
    requestKinds: {
      routing: Math.max(0, Number(requestKinds.routing ?? 0)),
      generation: Math.max(0, Number(requestKinds.generation ?? value?.requests ?? 0))
    }
  };
}

export function recordTokenUsage(
  ledgerValue,
  {
    jobId,
    inputTokens,
    outputTokens,
    totalTokens,
    costUsd = 0,
    requestKind = "generation",
    model,
    policyVersion = 0
  },
  nowMs = Date.now()
) {
  const ledger = normalizeUsageLedger(ledgerValue);
  const dayKey = getUtcDayKey(nowMs);
  const day = normalizeUsage(ledger.days[dayKey]);
  const job = normalizeUsage(ledger.jobs[jobId]);
  const delta = {
    inputTokens: Math.max(0, Number(inputTokens ?? 0)),
    outputTokens: Math.max(0, Number(outputTokens ?? 0)),
    totalTokens: Math.max(0, Number(totalTokens ?? 0)),
    costUsd: Math.max(0, Number(costUsd ?? 0))
  };
  const normalizedRequestKind = requestKind === "routing" ? "routing" : "generation";

  ledger.days[dayKey] = {
    inputTokens: day.inputTokens + delta.inputTokens,
    outputTokens: day.outputTokens + delta.outputTokens,
    totalTokens: day.totalTokens + delta.totalTokens,
    requests: day.requests + 1,
    costUsd: Number((day.costUsd + delta.costUsd).toFixed(8)),
    requestKinds: {
      ...day.requestKinds,
      [normalizedRequestKind]: day.requestKinds[normalizedRequestKind] + 1
    }
  };
  ledger.jobs[jobId] = {
    inputTokens: job.inputTokens + delta.inputTokens,
    outputTokens: job.outputTokens + delta.outputTokens,
    totalTokens: job.totalTokens + delta.totalTokens,
    requests: job.requests + 1,
    costUsd: Number((job.costUsd + delta.costUsd).toFixed(8)),
    policyVersion: Math.max(job.policyVersion, Math.max(0, Number(policyVersion ?? 0))),
    requestKinds: {
      ...job.requestKinds,
      [normalizedRequestKind]: job.requestKinds[normalizedRequestKind] + 1
    },
    lastModel: model,
    updatedAt: new Date(nowMs).toISOString()
  };
  return ledger;
}

export function getUsageBudgetState(
  ledgerValue,
  { jobId, jobTokenBudget, jobCostBudgetUsd },
  nowMs = Date.now()
) {
  const ledger = normalizeUsageLedger(ledgerValue);
  const day = normalizeUsage(ledger.days[getUtcDayKey(nowMs)]);
  const job = normalizeUsage(ledger.jobs[jobId]);
  return {
    daily: day,
    job,
    jobExceeded: job.totalTokens >= jobTokenBudget,
    jobCostExceeded: job.costUsd >= jobCostBudgetUsd,
    jobRemaining: Math.max(0, jobTokenBudget - job.totalTokens),
    jobCostRemainingUsd: Math.max(0, Number((jobCostBudgetUsd - job.costUsd).toFixed(8)))
  };
}

export function getMonthlyUsage(ledgerValue, nowMs = Date.now()) {
  const ledger = normalizeUsageLedger(ledgerValue);
  const monthPrefix = `${getUtcMonthKey(nowMs)}-`;
  return Object.entries(ledger.days)
    .filter(([day]) => day.startsWith(monthPrefix))
    .reduce((total, [, usage]) => {
      const normalized = normalizeUsage(usage);
      return {
        inputTokens: total.inputTokens + normalized.inputTokens,
        outputTokens: total.outputTokens + normalized.outputTokens,
        totalTokens: total.totalTokens + normalized.totalTokens,
        requests: total.requests + normalized.requests,
        costUsd: Number((total.costUsd + normalized.costUsd).toFixed(8))
      };
    }, {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      requests: 0,
      costUsd: 0
    });
}
