import assert from "node:assert/strict";
import test from "node:test";
import {
  getMonthlyUsage,
  getNextUtcMonthIso,
  getUsageBudgetState,
  recordTokenUsage
} from "../lib/usage-budget.mjs";

test("token usage is accumulated by UTC day and by job", () => {
  const nowMs = Date.parse("2026-07-29T12:00:00.000Z");
  let ledger = recordTokenUsage({}, {
    jobId: "25",
    inputTokens: 1_000,
    outputTokens: 2_000,
    totalTokens: 3_000,
    costUsd: 0.01,
    requestKind: "routing"
  }, nowMs);
  ledger = recordTokenUsage(ledger, {
    jobId: "25",
    inputTokens: 500,
    outputTokens: 500,
    totalTokens: 1_000,
    costUsd: 0.02,
    requestKind: "generation",
    policyVersion: 7
  }, nowMs);

  const state = getUsageBudgetState(ledger, {
    jobId: "25",
    jobTokenBudget: 5_000,
    jobCostBudgetUsd: 0.05
  }, nowMs);
  assert.equal(state.daily.totalTokens, 4_000);
  assert.equal(state.job.totalTokens, 4_000);
  assert.equal(state.job.requests, 2);
  assert.equal(state.job.requestKinds.routing, 1);
  assert.equal(state.job.requestKinds.generation, 1);
  assert.equal(state.job.policyVersion, 7);
  assert.equal(state.job.costUsd, 0.03);
  assert.equal(state.jobCostRemainingUsd, 0.02);
});

test("per-job token and cost limits fail closed without a daily execution stop", () => {
  const nowMs = Date.parse("2026-07-29T12:00:00.000Z");
  const ledger = recordTokenUsage({}, {
    jobId: "25",
    inputTokens: 2_000,
    outputTokens: 3_000,
    totalTokens: 5_000,
    costUsd: 0.05
  }, nowMs);
  const state = getUsageBudgetState(ledger, {
    jobId: "25",
    jobTokenBudget: 5_000,
    jobCostBudgetUsd: 0.05
  }, nowMs);
  assert.equal(state.jobExceeded, true);
  assert.equal(state.jobCostExceeded, true);
  assert.equal(state.daily.totalTokens, 5_000);
});

test("monthly usage is telemetry and an optional emergency guard rather than a daily budget", () => {
  const july29 = Date.parse("2026-07-29T12:00:00.000Z");
  const july30 = Date.parse("2026-07-30T12:00:00.000Z");
  let ledger = recordTokenUsage({}, {
    jobId: "25",
    inputTokens: 1_000,
    outputTokens: 1_000,
    totalTokens: 2_000,
    costUsd: 0.02
  }, july29);
  ledger = recordTokenUsage(ledger, {
    jobId: "26",
    inputTokens: 2_000,
    outputTokens: 2_000,
    totalTokens: 4_000,
    costUsd: 0.03
  }, july30);

  assert.equal(getMonthlyUsage(ledger, july30).costUsd, 0.05);
  assert.equal(getMonthlyUsage(ledger, july30).totalTokens, 6_000);
  assert.equal(getNextUtcMonthIso(july30), "2026-08-01T00:00:00.000Z");
});

test("funded retry versions receive isolated per-execution budgets while daily spend remains cumulative", () => {
  const nowMs = Date.parse("2026-07-31T12:00:00.000Z");
  let ledger = recordTokenUsage({}, {
    jobId: "2000000:v1",
    inputTokens: 4_000,
    outputTokens: 1_000,
    totalTokens: 5_000,
    costUsd: 0.05
  }, nowMs);
  ledger = recordTokenUsage(ledger, {
    jobId: "2000000:v2",
    inputTokens: 800,
    outputTokens: 200,
    totalTokens: 1_000,
    costUsd: 0.01
  }, nowMs);

  const retry = getUsageBudgetState(ledger, {
    jobId: "2000000:v2",
    jobTokenBudget: 5_000,
    jobCostBudgetUsd: 0.05
  }, nowMs);
  assert.equal(retry.job.totalTokens, 1_000);
  assert.equal(retry.job.costUsd, 0.01);
  assert.equal(retry.daily.totalTokens, 6_000);
  assert.equal(retry.daily.costUsd, 0.06);
});
