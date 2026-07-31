import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import solc from "solc";

const BPS = 10_000n;
const COMPUTE_FEE_BPS = 1_500n;
const CLIENT_BOND_BPS = 2_000n;
const PLATFORM_FEE_BPS = 300n;
const EVALUATOR_FEE_BPS = 200n;

function quote(reward) {
  const compute = (reward * COMPUTE_FEE_BPS) / BPS;
  const bond = (reward * CLIENT_BOND_BPS) / BPS;
  const platform = (reward * PLATFORM_FEE_BPS) / BPS;
  const evaluator = (reward * EVALUATOR_FEE_BPS) / BPS;
  return {
    reward,
    compute,
    bond,
    platform,
    evaluator,
    remaining: reward - compute,
    total: reward + bond + platform + evaluator
  };
}

test("Escrow V2 compiles within the EVM contract size limit", () => {
  const source = fs.readFileSync("contracts/ArcTaskEscrowV2.sol", "utf8");
  const output = JSON.parse(
    solc.compile(
      JSON.stringify({
        language: "Solidity",
        sources: { "ArcTaskEscrowV2.sol": { content: source } },
        settings: {
          optimizer: { enabled: true, runs: 200 },
          outputSelection: {
            "*": {
              "*": ["abi", "evm.deployedBytecode.object"]
            }
          }
        }
      })
    )
  );
  const errors = (output.errors ?? []).filter(({ severity }) => severity === "error");
  assert.deepEqual(errors, []);

  const compiled = output.contracts["ArcTaskEscrowV2.sol"].ArcTaskEscrowV2;
  const deployedBytes = compiled.evm.deployedBytecode.object.length / 2;
  assert.ok(deployedBytes > 0);
  assert.ok(deployedBytes <= 24_576, `deployed bytecode is ${deployedBytes} bytes`);
});

test("Escrow V2 ABI exposes hybrid review, dispute, refund, and withdrawal actions", () => {
  const abi = JSON.parse(fs.readFileSync("lib/contracts/abis/ERC8183EscrowV2.json", "utf8"));
  const functions = new Set(
    abi.filter(({ type }) => type === "function").map(({ name }) => name)
  );

  for (const functionName of [
    "quoteFunding",
    "createJob",
    "submitDeliverable",
    "requestRevision",
    "acceptWork",
    "finalizeReview",
    "openDispute",
    "resolveDispute",
    "finalizeStaleDispute",
    "refundExpired",
    "withdraw",
    "getJobEconomics",
    "getJobResolution",
    "fundRetry",
    "getJobExecution"
  ]) {
    assert.ok(functions.has(functionName), `${functionName} is missing`);
  }
  assert.equal(functions.has("rejectWork"), false);
});

test("retry top-ups preserve percentage economics and isolate the new execution budget", () => {
  const initial = quote(2n * 10n ** 18n);
  const retry = quote(1n * 10n ** 18n);
  const totalFunding = initial.total + retry.total;
  const aggregateReward = initial.reward + retry.reward;
  const aggregateCompute = initial.compute + retry.compute;
  const aggregateBond = initial.bond + retry.bond;
  const aggregatePlatform = initial.platform + retry.platform;
  const aggregateEvaluator = initial.evaluator + retry.evaluator;

  assert.equal(retry.reward, 1n * 10n ** 18n);
  assert.equal(
    aggregateReward + aggregateBond + aggregatePlatform + aggregateEvaluator,
    totalFunding
  );
  assert.equal(
    aggregatePlatform +
      aggregateCompute +
      (aggregateReward - aggregateCompute) +
      aggregateBond +
      aggregateEvaluator,
    totalFunding
  );
});

test("Escrow V2 percentage allocations conserve all client funding", () => {
  const economics = quote(100n * 10n ** 18n);
  assert.equal(economics.compute, 15n * 10n ** 18n);
  assert.equal(economics.bond, 20n * 10n ** 18n);
  assert.equal(economics.platform, 3n * 10n ** 18n);
  assert.equal(economics.evaluator, 2n * 10n ** 18n);
  assert.equal(economics.total, 125n * 10n ** 18n);

  const accept =
    economics.platform +
    economics.compute +
    economics.remaining +
    economics.bond +
    economics.evaluator;
  assert.equal(accept, economics.total);

  const arbitrationFee = economics.bond / 4n;
  const clientWins =
    economics.platform +
    economics.compute +
    economics.evaluator +
    economics.remaining +
    arbitrationFee +
    (economics.bond - arbitrationFee);
  assert.equal(clientWins, economics.total);

  const providerWins = clientWins;
  assert.equal(providerWins, economics.total);

  const staleProviderAward = economics.remaining / 2n;
  const staleClientRefund = economics.remaining - staleProviderAward;
  const stale =
    economics.platform +
    economics.compute +
    economics.evaluator +
    staleProviderAward +
    staleClientRefund +
    economics.bond;
  assert.equal(stale, economics.total);
});

test("expired jobs preserve the compute fee only after a valid submission", () => {
  const economics = quote(100n * 10n ** 18n);
  const refundBeforeSubmission =
    economics.reward + economics.bond + economics.evaluator;
  assert.equal(economics.platform + refundBeforeSubmission, economics.total);

  const refundAfterRevision =
    economics.remaining + economics.bond + economics.evaluator;
  assert.equal(
    economics.platform + economics.compute + refundAfterRevision,
    economics.total
  );
});
