import assert from "node:assert/strict";
import test from "node:test";
import {
  getNextUtcDayIso,
  getUsageBudgetState,
  recordTokenUsage
} from "../lib/usage-budget.mjs";

test("token usage is accumulated by UTC day and by job", () => {
  const nowMs = Date.parse("2026-07-29T12:00:00.000Z");
  let ledger = recordTokenUsage({}, {
    jobId: "25",
    inputTokens: 1_000,
    outputTokens: 2_000,
    totalTokens: 3_000
  }, nowMs);
  ledger = recordTokenUsage(ledger, {
    jobId: "25",
    inputTokens: 500,
    outputTokens: 500,
    totalTokens: 1_000
  }, nowMs);

  const state = getUsageBudgetState(ledger, {
    jobId: "25",
    dailyTokenBudget: 10_000,
    jobTokenBudget: 5_000
  }, nowMs);
  assert.equal(state.daily.totalTokens, 4_000);
  assert.equal(state.job.totalTokens, 4_000);
  assert.equal(state.job.requests, 2);
  assert.equal(state.dailyRemaining, 6_000);
});

test("daily and per-job limits fail closed at their configured ceilings", () => {
  const nowMs = Date.parse("2026-07-29T12:00:00.000Z");
  const ledger = recordTokenUsage({}, {
    jobId: "25",
    inputTokens: 2_000,
    outputTokens: 3_000,
    totalTokens: 5_000
  }, nowMs);
  const state = getUsageBudgetState(ledger, {
    jobId: "25",
    dailyTokenBudget: 5_000,
    jobTokenBudget: 5_000
  }, nowMs);
  assert.equal(state.dailyExceeded, true);
  assert.equal(state.jobExceeded, true);
  assert.equal(getNextUtcDayIso(nowMs), "2026-07-30T00:00:00.000Z");
});
