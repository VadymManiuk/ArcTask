import assert from "node:assert/strict";
import test from "node:test";
import { collectMarketplaceEvidence } from "../scripts/agent-marketplace-evidence.mjs";

test("marketplace evidence calculates status and agent aggregates from Arc state", async () => {
  const publicClient = {
    chain: { name: "Arc Testnet" },
    getBlockNumber: async () => 100n,
    getChainId: async () => 5_042_002,
    readContract: async ({ functionName, args }) => {
      if (functionName === "nextJobId") return 3n;
      if (functionName === "nextAgentId") return 2n;
      if (functionName === "jobs") {
        const id = args[0];
        return [
          "0x0000000000000000000000000000000000000001",
          1n,
          "0x0000000000000000000000000000000000000002",
          "0x0000000000000000000000000000000000000003",
          id === 1n ? 1_000_000_000_000_000_000n : 2_000_000_000_000_000_000n,
          200,
          `data:application/json,${encodeURIComponent(JSON.stringify({ title: `Job ${id}` }))}`,
          `0x${"0".repeat(64)}`,
          id === 1n ? 2 : 3,
          10n,
          20n
        ];
      }
      if (functionName === "agents") {
        return [
          "0x0000000000000000000000000000000000000002",
          `data:application/json,${encodeURIComponent(JSON.stringify({ name: "Agent One" }))}`,
          1n,
          true,
          72,
          3n,
          2n,
          1_000_000_000_000_000_000n
        ];
      }
      throw new Error(`Unexpected function ${functionName}`);
    }
  };

  const evidence = await collectMarketplaceEvidence({
    publicClient,
    escrowAddress: "0x0000000000000000000000000000000000000010",
    registryAddress: "0x0000000000000000000000000000000000000020",
    escrowAbi: [],
    registryAbi: []
  });

  assert.equal(evidence.referenceBlock, "100");
  assert.equal(evidence.aggregates.jobStatusCounts.ACCEPTED, 1);
  assert.equal(evidence.aggregates.jobStatusCounts.REJECTED, 1);
  assert.equal(evidence.aggregates.rewardByStatus.ACCEPTED, "1 USDC");
  assert.equal(evidence.aggregates.completedJobs, 3);
  assert.equal(evidence.aggregates.rejectedJobs, 2);
  assert.equal(evidence.agents[0].name, "Agent One");
});

test("marketplace evidence never scans below a versioned escrow job floor", async () => {
  const observedJobIds = [];
  const publicClient = {
    chain: { name: "Arc Testnet" },
    getBlockNumber: async () => 200n,
    getChainId: async () => 5_042_002,
    readContract: async ({ functionName, args }) => {
      if (functionName === "nextJobId") return 2_000_012n;
      if (functionName === "nextAgentId") return 1n;
      if (functionName === "jobs") {
        observedJobIds.push(args[0]);
        return [
          "0x0000000000000000000000000000000000000001",
          1n,
          "0x0000000000000000000000000000000000000002",
          "0x0000000000000000000000000000000000000003",
          1n,
          200,
          "",
          `0x${"0".repeat(64)}`,
          0,
          10n,
          20n
        ];
      }
      throw new Error(`Unexpected function ${functionName}`);
    }
  };

  const evidence = await collectMarketplaceEvidence({
    publicClient,
    escrowAddress: "0x0000000000000000000000000000000000000010",
    registryAddress: "0x0000000000000000000000000000000000000020",
    escrowAbi: [],
    registryAbi: [],
    minimumJobId: 2_000_000n
  });

  assert.equal(evidence.scope.firstJobId, "2000000");
  assert.equal(evidence.scope.sampledJobs, 12);
  assert.equal(observedJobIds[0], 2_000_000n);
  assert.equal(observedJobIds.at(-1), 2_000_011n);
});
