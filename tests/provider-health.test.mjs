import assert from "node:assert/strict";
import test from "node:test";
import {
  createQuotaCooldown,
  getProviderCooldownMs,
  isProviderCooldownActive,
  isProviderQuotaError
} from "../lib/provider-health.mjs";

test("quota errors are classified without treating ordinary quality failures as provider outages", () => {
  assert.equal(isProviderQuotaError(new Error("You exceeded your current quota, please check billing.")), true);
  assert.equal(isProviderQuotaError(new Error("insufficient_quota")), true);
  assert.equal(isProviderQuotaError(new Error("Deliverable is missing required topics.")), false);
});

test("provider cooldown backs off exponentially and remains bounded", () => {
  assert.equal(getProviderCooldownMs({ consecutiveFailures: 1, baseCooldownMs: 1_000, maxCooldownMs: 8_000 }), 1_000);
  assert.equal(getProviderCooldownMs({ consecutiveFailures: 4, baseCooldownMs: 1_000, maxCooldownMs: 8_000 }), 8_000);
  assert.equal(getProviderCooldownMs({ consecutiveFailures: 10, baseCooldownMs: 1_000, maxCooldownMs: 8_000 }), 8_000);
});

test("quota cooldown exposes a retry time and becomes inactive after it expires", () => {
  const nowMs = Date.parse("2026-07-29T13:00:00.000Z");
  const health = createQuotaCooldown(undefined, nowMs, {
    baseCooldownMs: 60_000,
    maxCooldownMs: 60_000
  });
  assert.equal(isProviderCooldownActive(health, nowMs), true);
  assert.equal(isProviderCooldownActive(health, nowMs + 60_001), false);
});
