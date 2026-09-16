import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const nonceTtlMs = 5 * 60 * 1000;
const usedNonceTtlMs = 10 * 60 * 1000;
const developmentSecret = crypto.randomBytes(32).toString("hex");
const usedNonces = new Map<string, number>();

function pruneUsedNonces(now: number) {
  for (const [nonce, expiresAt] of usedNonces) {
    if (expiresAt <= now) {
      usedNonces.delete(nonce);
    }
  }
}

function signNonce(payload: string) {
  const nonceSecret = process.env.ARCTASK_ACCESS_NONCE_SECRET;
  if (!nonceSecret && process.env.NODE_ENV === "production") throw new Error("Stable deliverable nonce secret is required.");
  return crypto.createHmac("sha256", nonceSecret || developmentSecret).update(payload).digest("base64url");
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

export function isDeliverableNonceValid(jobId: string, nonce: string) {
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

  return true;
}

let lastDiskCleanup = 0;
export function consumeDeliverableNonce(jobId: string, nonce: string, directory?: string) {
  if (!isDeliverableNonceValid(jobId, nonce)) return false;
  const now = Date.now();
  if (directory) {
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    if (now - lastDiskCleanup > 60_000) {
      for (const name of fs.readdirSync(directory)) {
        if (/^\d+-[a-f0-9]{64}\.used$/.test(name) && Number(name.split("-")[0]) <= now) {
          fs.rmSync(path.join(directory, name), { force: true });
        }
      }
      lastDiskCleanup = now;
    }
    const file = path.join(directory, `${nonce.split(".")[1]}-${crypto.createHash("sha256").update(nonce).digest("hex")}.used`);
    try { fs.writeFileSync(file, "", { flag: "wx", mode: 0o600 }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "EEXIST") return false; throw error; }
  }
  usedNonces.set(nonce, now + usedNonceTtlMs);
  return true;
}
