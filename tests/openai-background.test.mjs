import assert from "node:assert/strict";
import test from "node:test";
import {
  allocateAttemptTimeout,
  describeOpenAiResponse,
  lowerReasoningEffort,
  requestBackgroundResponse
} from "../lib/openai-background.mjs";

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  };
}

test("background responses are polled until completion", async () => {
  const calls = [];
  const bodies = [
    { id: "resp_1", status: "queued" },
    { id: "resp_1", status: "in_progress" },
    { id: "resp_1", status: "completed", output_text: "done" }
  ];

  const result = await requestBackgroundResponse({
    apiKey: "test",
    baseUrl: "https://api.openai.test/v1",
    requestBody: { model: "gpt-5.6-sol", input: "test" },
    timeoutMs: 5_000,
    pollIntervalMs: 1,
    sleepImpl: async () => {},
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return jsonResponse(bodies.shift());
    }
  });

  assert.equal(result.output_text, "done");
  assert.equal(calls.length, 3);
  assert.equal(JSON.parse(calls[0].options.body).background, true);
  assert.match(calls[1].url, /\/responses\/resp_1$/);
});

test("failed background responses include useful API details", async () => {
  await assert.rejects(
    requestBackgroundResponse({
      apiKey: "test",
      baseUrl: "https://api.openai.test/v1",
      requestBody: { model: "gpt-5.6-sol", input: "test" },
      timeoutMs: 5_000,
      pollIntervalMs: 1,
      sleepImpl: async () => {},
      fetchImpl: async () =>
        jsonResponse({
          id: "resp_failed",
          status: "failed",
          error: { code: "server_error", message: "temporary model failure" }
        })
    }),
    /temporary model failure/
  );
});

test("retry routing preserves time for a lower-effort fallback", () => {
  assert.equal(
    allocateAttemptTimeout({
      remainingMs: 420_000,
      requestTimeoutMs: 135_000,
      attemptsLeft: 2
    }),
    360_000
  );
  assert.equal(lowerReasoningEffort("xhigh"), "high");
  assert.equal(lowerReasoningEffort("high"), "medium");
  assert.match(
    describeOpenAiResponse({
      status: "incomplete",
      incomplete_details: { reason: "max_output_tokens" }
    }),
    /max_output_tokens/
  );
});
