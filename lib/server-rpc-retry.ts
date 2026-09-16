function getErrorMessage(caught: unknown) {
  if (caught instanceof Error) {
    const causeMessage =
      caught.cause instanceof Error ? caught.cause.message : caught.cause ? String(caught.cause) : "";
    return `${caught.message} ${causeMessage}`;
  }

  return String(caught);
}

export function isRetryableRpcError(caught: unknown) {
  const message = getErrorMessage(caught).toLowerCase();
  return (
    message.includes("request limit reached") ||
    message.includes("rate limit") ||
    message.includes("too many requests") ||
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("fetch failed") ||
    message.includes("socket hang up") ||
    /(?:http|status|status code)[: ]+(?:408|429|500|502|503|504)\b/.test(message) ||
    message.includes("temporarily unavailable") ||
    message.includes("no answer was obtained")
  );
}

export async function withServerRpcRetry<T>(
  operation: () => Promise<T>,
  options: { maxAttempts?: number; baseDelayMs?: number } = {}
) {
  const maxAttempts = options.maxAttempts ?? 2;
  const baseDelayMs = options.baseDelayMs ?? 250;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (caught) {
      lastError = caught;
      if (!isRetryableRpcError(caught) || attempt === maxAttempts) {
        throw caught;
      }

      await new Promise((resolve) => setTimeout(resolve, baseDelayMs * attempt));
    }
  }

  throw lastError;
}
