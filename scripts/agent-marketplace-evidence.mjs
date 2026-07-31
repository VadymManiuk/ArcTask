import { formatUnits } from "viem";
import { withRpcRetry } from "./arc-rpc.mjs";

const statusNames = ["FUNDED", "SUBMITTED", "ACCEPTED", "REJECTED", "REFUNDED"];

async function mapWithConcurrency(values, concurrency, mapper) {
  const results = new Array(values.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(values[index], index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, () => worker())
  );
  return results;
}

function decodeMetadataUri(metadataUri) {
  if (typeof metadataUri !== "string" || !metadataUri.startsWith("data:application/json,")) {
    return {};
  }

  try {
    const value = JSON.parse(decodeURIComponent(metadataUri.slice("data:application/json,".length)));
    return {
      name: typeof value?.name === "string" ? value.name : undefined,
      title: typeof value?.title === "string" ? value.title : undefined
    };
  } catch {
    return {};
  }
}

export async function collectMarketplaceEvidence({
  publicClient,
  escrowAddress,
  registryAddress,
  escrowAbi,
  registryAbi,
  minimumJobId = 1n,
  maximumJobs = 50,
  maximumAgents = 50
}) {
  const observedAt = new Date().toISOString();
  const [referenceBlock, nextJobId, nextAgentId] = await Promise.all([
    withRpcRetry(() => publicClient.getBlockNumber()),
    withRpcRetry(() =>
      publicClient.readContract({
        address: escrowAddress,
        abi: escrowAbi,
        functionName: "nextJobId"
      })
    ),
    withRpcRetry(() =>
      publicClient.readContract({
        address: registryAddress,
        abi: registryAbi,
        functionName: "nextAgentId"
      })
    )
  ]);
  const windowFirstJobId =
    nextJobId > BigInt(maximumJobs) ? nextJobId - BigInt(maximumJobs) : minimumJobId;
  const firstJobId = windowFirstJobId > minimumJobId ? windowFirstJobId : minimumJobId;
  const firstAgentId = nextAgentId > BigInt(maximumAgents) ? nextAgentId - BigInt(maximumAgents) : 1n;
  const jobIds = [];
  const agentIds = [];

  for (let jobId = firstJobId; jobId < nextJobId; jobId += 1n) {
    jobIds.push(jobId);
  }
  for (let agentId = firstAgentId; agentId < nextAgentId; agentId += 1n) {
    agentIds.push(agentId);
  }

  const onchainJobs =
    typeof publicClient.multicall === "function" && jobIds.length > 0
      ? await withRpcRetry(() =>
          publicClient.multicall({
            allowFailure: false,
            contracts: jobIds.map((jobId) => ({
              address: escrowAddress,
              abi: escrowAbi,
              functionName: "jobs",
              args: [jobId]
            }))
          })
        )
      : await mapWithConcurrency(jobIds, 3, (jobId) =>
          withRpcRetry(() =>
            publicClient.readContract({
              address: escrowAddress,
              abi: escrowAbi,
              functionName: "jobs",
              args: [jobId]
            })
          )
        );
  const jobs = onchainJobs.map((job, index) => {
    const jobId = jobIds[index];
    const metadata = decodeMetadataUri(job[6]);

    return {
      jobId: jobId.toString(),
      title: metadata.title ?? `ArcTask job ${jobId.toString()}`,
      agentId: job[1].toString(),
      client: job[0],
      agentOwner: job[2],
      evaluator: job[3],
      rewardRaw: job[4].toString(),
      rewardDisplay: `${formatUnits(job[4], 18)} USDC`,
      deadline: Number(job[5]),
      status: statusNames[Number(job[8])] ?? `UNKNOWN_${Number(job[8])}`,
      createdAt: job[9].toString(),
      updatedAt: job[10].toString()
    };
  });
  const onchainAgents =
    typeof publicClient.multicall === "function" && agentIds.length > 0
      ? await withRpcRetry(() =>
          publicClient.multicall({
            allowFailure: false,
            contracts: agentIds.map((agentId) => ({
              address: registryAddress,
              abi: registryAbi,
              functionName: "agents",
              args: [agentId]
            }))
          })
        )
      : await mapWithConcurrency(agentIds, 3, (agentId) =>
          withRpcRetry(() =>
            publicClient.readContract({
              address: registryAddress,
              abi: registryAbi,
              functionName: "agents",
              args: [agentId]
            })
          )
        );
  const agents = onchainAgents.map((agent, index) => {
    const agentId = agentIds[index];
    const metadata = decodeMetadataUri(agent[1]);

    return {
      agentId: agentId.toString(),
      name: metadata.name ?? `Agent #${agentId.toString()}`,
      owner: agent[0],
      active: agent[3],
      reputation: Number(agent[4]),
      completedJobs: Number(agent[5]),
      rejectedJobs: Number(agent[6]),
      totalEarnedRaw: agent[7].toString(),
      totalEarnedDisplay: `${formatUnits(agent[7], 18)} USDC`
    };
  });
  const jobStatusCounts = Object.fromEntries(statusNames.map((status) => [status, 0]));
  const rewardByStatusRaw = Object.fromEntries(statusNames.map((status) => [status, 0n]));

  for (const job of jobs) {
    if (job.status in jobStatusCounts) {
      jobStatusCounts[job.status] += 1;
      rewardByStatusRaw[job.status] += BigInt(job.rewardRaw);
    }
  }

  return {
    kind: "arctask_marketplace_snapshot",
    available: true,
    observedAt,
    referenceBlock: referenceBlock.toString(),
    network: {
      name: publicClient.chain?.name ?? "Arc Testnet",
      chainId: await withRpcRetry(() => publicClient.getChainId())
    },
    scope: {
      firstJobId: jobIds[0]?.toString() ?? null,
      nextJobId: nextJobId.toString(),
      sampledJobs: jobs.length,
      firstAgentId: agentIds[0]?.toString() ?? null,
      nextAgentId: nextAgentId.toString(),
      sampledAgents: agents.length
    },
    aggregates: {
      jobStatusCounts,
      rewardByStatus: Object.fromEntries(
        statusNames.map((status) => [
          status,
          `${formatUnits(rewardByStatusRaw[status], 18)} USDC`
        ])
      ),
      completedJobs: agents.reduce((sum, agent) => sum + agent.completedJobs, 0),
      rejectedJobs: agents.reduce((sum, agent) => sum + agent.rejectedJobs, 0),
      totalEarned: `${formatUnits(
        agents.reduce((sum, agent) => sum + BigInt(agent.totalEarnedRaw), 0n),
        18
      )} USDC`
    },
    jobs,
    agents,
    limitations: [
      "This is a bounded Arc RPC snapshot at the reference block, not an analytics warehouse or full event-history export.",
      "Current job state alone cannot reconstruct every intermediate status transition or calculate latency percentiles.",
      "Self-evaluated jobs must be segmented from independently evaluated jobs before reputation-quality comparisons."
    ]
  };
}
