function getErrorMessage(caught) {
  return caught instanceof Error ? `${caught.message} ${caught.cause?.message ?? ""}` : String(caught);
}

function isRetryableRpcError(caught) {
  const message = getErrorMessage(caught).toLowerCase();
  return (
    message.includes("request limit reached") ||
    message.includes("rate limit") ||
    message.includes("too many requests") ||
    message.includes("timeout") ||
    message.includes("temporarily unavailable")
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForTransactionReceiptWithRetry(publicClient, hash, options = {}) {
  return withRpcRetry(() => publicClient.waitForTransactionReceipt({ hash }), options);
}

export async function withRpcRetry(operation, options = {}) {
  const maxAttempts = options.maxAttempts ?? 8;
  const baseDelayMs = options.baseDelayMs ?? 2_000;
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (caught) {
      lastError = caught;
      if (!isRetryableRpcError(caught) || attempt === maxAttempts) {
        throw caught;
      }

      await sleep(baseDelayMs * attempt);
    }
  }

  throw lastError;
}
