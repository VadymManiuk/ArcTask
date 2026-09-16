import assert from "node:assert/strict";
import test from "node:test";
import { ARC_MAINNET, assertArcContracts, assertArcMainnet, defaultContractAddresses, getArcChain, getDeploymentScope, isMainnetContractAddress } from "../lib/arc-network.mjs";
import { withRpcRetry } from "../scripts/arc-rpc.mjs";
import { withServerRpcRetry } from "../lib/server-rpc-retry.ts";

test("mainnet config uses native USDC units and has no testnet contract fallback", () => {
  const chain = getArcChain();
  assert.equal(chain.id, 5042);
  assert.equal(chain.testnet, false);
  assert.equal(chain.nativeCurrency.decimals, 18);
  assert.equal(chain.rpcUrls.default.http[0], ARC_MAINNET.rpcUrl);
  assert.deepEqual(Object.values(defaultContractAddresses).filter(Boolean), ["native"]);
  assert.equal(isMainnetContractAddress("0xd8499627775ac67cd756335a3c48387d0aff5553"), false);
  assert.equal(isMainnetContractAddress("0x0000000000000000000000000000000000000000"), false);
});

test("mainnet rejects testnet and insecure endpoint overrides", () => {
  for (const name of ["NEXT_PUBLIC_ARC_RPC_URL", "NEXT_PUBLIC_ARC_EXPLORER_URL", "ARC_AGENT_READ_RPC_URL", "ARC_SECONDARY_RPC_URL"]) {
    assert.throws(() => getArcChain({ [name]: "https://rpc.testnet.arc.io" }), /mainnet/);
    assert.throws(() => getArcChain({ [name]: "http://example.com" }), /HTTPS/);
  }
  assert.equal(getArcChain({ NEXT_PUBLIC_ARC_RPC_URL: "https://rpc.example.com" }).rpcUrls.default.http[0], "https://rpc.example.com");
});

test("RPC checks reject wrong chains, missing configuration and empty bytecode", async () => {
  let reads = 0;
  const client = { getChainId: async () => 5042002, getCode: async () => { reads++; return "0x"; } };
  await assert.rejects(assertArcMainnet(client), /Wrong RPC network/);
  await assert.rejects(assertArcContracts(client, ["0x1111111111111111111111111111111111111111"]), /Wrong RPC network/);
  assert.equal(reads, 0);
  client.getChainId = async () => 5042;
  await assert.rejects(assertArcContracts(client, [""]), /Missing or invalid/);
  await assert.rejects(assertArcContracts(client, ["0x1111111111111111111111111111111111111111"]), /No mainnet contract/);
  client.getCode = async () => "0x60006000";
  await assertArcContracts(client, ["0x1111111111111111111111111111111111111111"]);
});

test("state, worker files and signatures can be isolated by chain and deployment", () => {
  assert.match(getDeploymentScope("0xAb", "0xCd"), /^5042-/);
  assert.equal(getDeploymentScope("0xAb", "0xCd"), getDeploymentScope("0xab", "0xcd"));
  assert.notEqual(getDeploymentScope("0xAb", "0xCd"), getDeploymentScope("0xAb", "0xEf"));
  assert.notEqual(getDeploymentScope(), getDeploymentScope("0xAb", "0xCd"));
});

test("Arc mainnet gateway outages retry reads without turning failures into empty data", async () => {
  for (const retry of [withRpcRetry, withServerRpcRetry]) {
    let attempts = 0;
    const result = await retry(async () => {
      if (++attempts === 1) throw new Error("arc-scan.org could not complete this request. No answer was obtained.");
      return 5042;
    }, { maxAttempts: 2, baseDelayMs: 1 });
    assert.equal(result, 5042);
    assert.equal(attempts, 2);
    await assert.rejects(retry(async () => { throw new Error("No answer was obtained."); }, { maxAttempts: 2, baseDelayMs: 1 }));
  }
});
