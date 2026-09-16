export function isOnchainId(value: string) {
  return /^[1-9]\d{0,77}$/.test(value) && BigInt(value) < (BigInt(1) << BigInt(256));
}

export async function readBoundedJson(request: Request, maximumBytes = 8192): Promise<unknown> {
  if (Number(request.headers.get("content-length") ?? 0) > maximumBytes) throw new Error("Request body too large.");
  const reader = request.body?.getReader();
  if (!reader) return null;
  const decoder = new TextDecoder();
  let length = 0;
  let body = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maximumBytes) {
        await reader.cancel();
        throw new Error("Request body too large.");
      }
      body += decoder.decode(value, { stream: true });
    }
    return JSON.parse(body + decoder.decode());
  } finally { reader.releaseLock(); }
}
