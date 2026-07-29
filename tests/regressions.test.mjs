import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { keccak256, stringToHex } from "viem";
import { getWorkerReportHash } from "../lib/deliverable-integrity.ts";
import { getJobDeadlineMs, getJobDeadlineSeconds } from "../lib/job-deadline.ts";
import { waitForTransactionReceiptWithRetry, withRpcRetry } from "../scripts/arc-rpc.mjs";
import { createDeliverableNonce, consumeDeliverableNonce } from "../lib/server-deliverable-nonce.ts";
import { isRetryableRpcError, withServerRpcRetry } from "../lib/server-rpc-retry.ts";
import { getAuthorizedAccount } from "../lib/wallet-account.ts";

function readAbi(fileName) {
  return JSON.parse(fs.readFileSync(new URL(`../lib/contracts/abis/${fileName}`, import.meta.url), "utf8"));
}

test("job deadlines use the final UTC second of the selected date", () => {
  assert.equal(getJobDeadlineMs("2026-07-28"), Date.parse("2026-07-28T23:59:59Z"));
  assert.equal(getJobDeadlineSeconds("2026-07-28"), 1_785_283_199n);
  assert.throws(() => getJobDeadlineMs("not-a-date"), /valid date/);
});

test("deliverable integrity ignores transport metadata but detects report changes", () => {
  const report = {
    kind: "ArcTask autonomous agent deliverable",
    version: 1,
    generatedAt: "2026-07-28T12:00:00.000Z",
    job: { jobId: "42" },
    result: { summary: "Verified result" }
  };
  const committedHash = keccak256(stringToHex(JSON.stringify(report, null, 2)));
  const storedFile = {
    ...report,
    deliverableHash: committedHash,
    txHash: "0x1234",
    txUrl: "https://testnet.arcscan.app/tx/0x1234"
  };

  assert.equal(getWorkerReportHash(storedFile), committedHash);
  assert.notEqual(
    getWorkerReportHash({
      ...storedFile,
      result: { summary: "Modified result" }
    }),
    committedHash
  );
});

test("deliverable nonces are job-bound, tamper-resistant, and single-use", () => {
  const { nonce } = createDeliverableNonce("42");

  assert.equal(consumeDeliverableNonce("41", nonce), false);
  assert.equal(consumeDeliverableNonce("42", `${nonce.slice(0, -1)}x`), false);
  assert.equal(consumeDeliverableNonce("42", nonce), true);
  assert.equal(consumeDeliverableNonce("42", nonce), false);
});

test("Reputation v2 ABI exposes authorized outcome recording and reputation reads", () => {
  const registryAbi = readAbi("ERC8004AgentRegistry.json");
  const escrowAbi = readAbi("ERC8183Escrow.json");
  const registryFunctions = new Set(registryAbi.filter((item) => item.type === "function").map((item) => item.name));
  const registryEvents = new Set(registryAbi.filter((item) => item.type === "event").map((item) => item.name));
  const escrowFunctions = new Set(escrowAbi.filter((item) => item.type === "function").map((item) => item.name));

  assert.equal(registryFunctions.has("setEscrowAuthorization"), true);
  assert.equal(registryFunctions.has("recordOutcome"), true);
  assert.equal(registryFunctions.has("getAgentReputation"), true);
  assert.equal(registryEvents.has("AgentReputationUpdated"), true);
  assert.equal(escrowFunctions.has("acceptWork"), true);
  assert.equal(escrowFunctions.has("rejectWork"), true);
});

test("receipt polling retries rate limits but does not hide permanent errors", async () => {
  let attempts = 0;
  const receipt = await waitForTransactionReceiptWithRetry(
    {
      async waitForTransactionReceipt() {
        attempts += 1;
        if (attempts === 1) {
          throw new Error("request limit reached");
        }

        return { status: "success" };
      }
    },
    "0x1234",
    { maxAttempts: 2, baseDelayMs: 1 }
  );

  assert.equal(attempts, 2);
  assert.equal(receipt.status, "success");
  await assert.rejects(
    waitForTransactionReceiptWithRetry(
      {
        async waitForTransactionReceipt() {
          throw new Error("execution reverted");
        }
      },
      "0x1234",
      { maxAttempts: 3, baseDelayMs: 1 }
    ),
    /execution reverted/
  );
});

test("generic RPC retry recovers read calls after a transient limit", async () => {
  let attempts = 0;
  const value = await withRpcRetry(
    async () => {
      attempts += 1;
      if (attempts < 3) {
        throw new Error("too many requests");
      }

      return 42n;
    },
    { maxAttempts: 3, baseDelayMs: 1 }
  );

  assert.equal(value, 42n);
  assert.equal(attempts, 3);
});

test("server RPC retry handles nested transient causes without retrying permanent failures", async () => {
  let attempts = 0;
  const value = await withServerRpcRetry(
    async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error("RPC Request failed", { cause: new Error("request limit reached") });
      }

      return "ok";
    },
    { maxAttempts: 2, baseDelayMs: 1 }
  );

  assert.equal(value, "ok");
  assert.equal(attempts, 2);
  assert.equal(isRetryableRpcError(new Error("execution reverted")), false);
});

test("wallet restoration accepts authorized accounts without requesting a new connection", () => {
  assert.equal(
    getAuthorizedAccount(["0x7B42ED8165710a86684a54E8B02ec0f61Da8C897"]),
    "0x7B42ED8165710a86684a54E8B02ec0f61Da8C897"
  );
  assert.equal(getAuthorizedAccount([]), null);
  assert.equal(getAuthorizedAccount("not-an-array"), null);
});
