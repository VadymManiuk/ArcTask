import crypto from "node:crypto";

const nonceTtlMs = 5 * 60 * 1000;
const usedNonceTtlMs = 10 * 60 * 1000;
const nonceSecret = process.env.ARCTASK_ACCESS_NONCE_SECRET ?? crypto.randomBytes(32).toString("hex");
const usedNonces = new Map<string, number>();

function pruneUsedNonces(now: number) {
  for (const [nonce, expiresAt] of usedNonces) {
    if (expiresAt <= now) {
      usedNonces.delete(nonce);
    }
  }
}

function signNonce(payload: string) {
  return crypto.createHmac("sha256", nonceSecret).update(payload).digest("base64url");
}

function signaturesMatch(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function createDeliverableNonce(jobId: string) {
  const issuedAt = new Date().toISOString();
  const expiresAtMs = Date.now() + nonceTtlMs;
  const random = crypto.randomBytes(16).toString("base64url");
  const payload = `${jobId}.${expiresAtMs}.${random}`;
  const nonce = `${payload}.${signNonce(payload)}`;

  return {
    nonce,
    issuedAt,
    expiresAt: new Date(expiresAtMs).toISOString()
  };
}

export function consumeDeliverableNonce(jobId: string, nonce: string) {
  const now = Date.now();
  pruneUsedNonces(now);

  const parts = nonce.split(".");
  if (parts.length !== 4) {
    return false;
  }

  const [nonceJobId, expiresAtRaw, random, signature] = parts;
  const expiresAtMs = Number(expiresAtRaw);
  const payload = `${nonceJobId}.${expiresAtRaw}.${random}`;
  const expectedSignature = signNonce(payload);

  if (
    nonceJobId !== jobId ||
    !Number.isFinite(expiresAtMs) ||
    expiresAtMs <= now ||
    !signaturesMatch(signature, expectedSignature) ||
    usedNonces.has(nonce)
  ) {
    return false;
  }

  usedNonces.set(nonce, now + usedNonceTtlMs);
  return true;
}
