const pendingStatuses = new Set(["queued", "in_progress"]);
const failedStatuses = new Set(["failed", "cancelled"]);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getErrorMessage(body, fallback) {
  return body?.error?.message ?? body?.error?.code ?? fallback;
}

async function fetchJson({
  fetchImpl,
  url,
  apiKey,
  method,
  body,
  timeoutMs
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(url, {
      method,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    const responseBody = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(getErrorMessage(responseBody, `OpenAI request failed with HTTP ${response.status}`));
    }

    return responseBody;
  } catch (caught) {
    if (caught instanceof Error && caught.name === "AbortError") {
      throw new Error(`OpenAI HTTP request exceeded ${timeoutMs}ms.`, { cause: caught });
    }

    throw caught;
  } finally {
    clearTimeout(timeout);
  }
}

async function cancelResponse({ fetchImpl, baseUrl, apiKey, responseId, httpTimeoutMs }) {
  try {
    await fetchJson({
      fetchImpl,
      url: `${baseUrl}/responses/${encodeURIComponent(responseId)}/cancel`,
      apiKey,
      method: "POST",
      timeoutMs: Math.min(httpTimeoutMs, 10_000)
    });
  } catch {
    // Cancellation is best effort. The original execution error is more useful to callers.
  }
}

export function describeOpenAiResponse(body) {
  const status = typeof body?.status === "string" ? body.status : "unknown";
  const incompleteReason = body?.incomplete_details?.reason;
  const error = body?.error?.message ?? body?.error?.code;
  const details = [incompleteReason ? `reason: ${incompleteReason}` : "", error ? `error: ${error}` : ""]
    .filter(Boolean)
    .join(", ");

  return `OpenAI response status was ${status}${details ? ` (${details})` : ""}.`;
}

export function lowerReasoningEffort(effort, steps = 1) {
  const levels = ["max", "xhigh", "high", "medium", "low", "none"];
  const currentIndex = levels.indexOf(effort);
  if (currentIndex === -1) {
    return effort;
  }

  return levels[Math.min(levels.length - 1, currentIndex + Math.max(0, steps))];
}

export function allocateAttemptTimeout({ remainingMs, requestTimeoutMs, attemptsLeft }) {
  const normalizedRemainingMs = Math.max(1_000, remainingMs);
  const normalizedRequestTimeoutMs = Math.max(1_000, requestTimeoutMs);
  const retriesAfterThisAttempt = Math.max(0, attemptsLeft - 1);
  const retryReserveMs = retriesAfterThisAttempt * Math.min(normalizedRequestTimeoutMs, 60_000);
  const availableBeforeRetryReserve = Math.max(1_000, normalizedRemainingMs - retryReserveMs);

  return Math.min(
    normalizedRemainingMs,
    Math.max(normalizedRequestTimeoutMs, availableBeforeRetryReserve)
  );
}

export async function requestBackgroundResponse({
  apiKey,
  baseUrl,
  requestBody,
  timeoutMs,
  httpTimeoutMs = 30_000,
  pollIntervalMs = 3_000,
  onProgress,
  fetchImpl = fetch,
  sleepImpl = sleep
}) {
  const startedAt = Date.now();
  const deadline = startedAt + timeoutMs;
  let responseBody;

  try {
    responseBody = await fetchJson({
      fetchImpl,
      url: `${baseUrl}/responses`,
      apiKey,
      method: "POST",
      body: {
        ...requestBody,
        background: true
      },
      timeoutMs: Math.min(httpTimeoutMs, timeoutMs)
    });

    while (pendingStatuses.has(responseBody?.status)) {
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 1_000) {
        throw new Error(`OpenAI background response exceeded ${timeoutMs}ms.`);
      }

      await onProgress?.({
        id: responseBody.id,
        status: responseBody.status,
        elapsedMs: Date.now() - startedAt
      });
      await sleepImpl(Math.min(pollIntervalMs, Math.max(1, remainingMs - 1_000)));

      const pollRemainingMs = deadline - Date.now();
      if (pollRemainingMs <= 0) {
        throw new Error(`OpenAI background response exceeded ${timeoutMs}ms.`);
      }

      responseBody = await fetchJson({
        fetchImpl,
        url: `${baseUrl}/responses/${encodeURIComponent(responseBody.id)}`,
        apiKey,
        method: "GET",
        timeoutMs: Math.min(httpTimeoutMs, pollRemainingMs)
      });
    }

    if (failedStatuses.has(responseBody?.status)) {
      throw new Error(describeOpenAiResponse(responseBody));
    }

    return responseBody;
  } catch (caught) {
    if (responseBody?.id && pendingStatuses.has(responseBody?.status)) {
      await cancelResponse({
        fetchImpl,
        baseUrl,
        apiKey,
        responseId: responseBody.id,
        httpTimeoutMs
      });
    }

    throw caught;
  }
}
