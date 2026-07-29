import { NextResponse } from "next/server";
import { createPublicClient, defineChain, formatUnits, http, type Abi } from "viem";
import { ARC_TESTNET } from "@/lib/arc";
import { rateLimit } from "@/lib/server-rate-limit";
import { withServerRpcRetry } from "@/lib/server-rpc-retry";
import registryAbi from "@/lib/contracts/abis/ERC8004AgentRegistry.json";
import type { Address } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

const defaultRegistryAddress = "0xd8499627775ac67cd756335a3c48387d0aff5553";

const arcTestnet = defineChain({
  id: ARC_TESTNET.chainId,
  name: ARC_TESTNET.chainName,
  nativeCurrency: ARC_TESTNET.nativeCurrency,
  rpcUrls: {
    default: {
      http: [process.env.NEXT_PUBLIC_ARC_RPC_URL ?? ARC_TESTNET.rpcUrl]
    }
  },
  blockExplorers: {
    default: {
      name: "Arcscan",
      url: ARC_TESTNET.explorerUrl
    }
  },
  contracts: {
    multicall3: {
      address: ARC_TESTNET.multicall3Address
    }
  },
  testnet: true
});

const publicClient = createPublicClient({
  chain: arcTestnet,
  transport: http(arcTestnet.rpcUrls.default.http[0])
});

type OnchainAgent = readonly [
  Address,
  string,
  bigint,
  boolean,
  number,
  bigint,
  bigint,
  bigint
];

function getRegistryAddress() {
  return (process.env.NEXT_PUBLIC_ERC8004_REGISTRY_ADDRESS ?? defaultRegistryAddress) as Address;
}

function decodeAgentMetadata(metadataURI: string) {
  if (!metadataURI.startsWith("data:application/json,")) {
    return null;
  }

  try {
    const parsed = JSON.parse(decodeURIComponent(metadataURI.slice("data:application/json,".length))) as {
      name?: unknown;
      description?: unknown;
      capabilities?: unknown;
    };

    return {
      name: typeof parsed.name === "string" ? parsed.name.trim() : "",
      description: typeof parsed.description === "string" ? parsed.description.trim() : "",
      capabilities: Array.isArray(parsed.capabilities)
        ? parsed.capabilities.filter((value): value is string => typeof value === "string" && Boolean(value.trim()))
        : []
    };
  } catch {
    return null;
  }
}

function serializeAgent(agentId: bigint, agent: OnchainAgent) {
  const metadata = decodeAgentMetadata(agent[1]);

  return {
    onchainAgentId: agentId.toString(),
    ownerWallet: agent[0],
    metadataURI: agent[1],
    createdAt: agent[2].toString(),
    active: agent[3],
    reputation: Number(agent[4]),
    completedJobs: Number(agent[5]),
    rejectedJobs: Number(agent[6]),
    totalEarned: Number(formatUnits(agent[7], arcTestnet.nativeCurrency.decimals)),
    name: metadata?.name || `Agent #${agentId.toString()}`,
    description: metadata?.description || "Autonomous agent registered on ArcTask.",
    capabilities: metadata?.capabilities ?? []
  };
}

function isInternalTestAgent(agent: ReturnType<typeof serializeAgent>) {
  return agent.metadataURI.includes("/metadata/testnet-agent-");
}

export async function GET(request: Request) {
  const rateLimitResponse = rateLimit(request, { keyPrefix: "network-agents", limit: 60, windowMs: 60_000 });
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const { searchParams } = new URL(request.url);
  const limitValue = Number(searchParams.get("limit") ?? 100);
  const limit = Number.isInteger(limitValue) && limitValue > 0 ? Math.min(limitValue, 100) : 100;

  try {
    const nextAgentId = await withServerRpcRetry(
      () =>
        publicClient.readContract({
          address: getRegistryAddress(),
          abi: registryAbi,
          functionName: "nextAgentId"
        }) as Promise<bigint>
    );
    const one = BigInt(1);
    const firstAgentId = nextAgentId > BigInt(limit) ? nextAgentId - BigInt(limit) : one;
    const agentIds: bigint[] = [];
    for (let agentId = firstAgentId; agentId < nextAgentId; agentId += one) {
      agentIds.push(agentId);
    }

    const onchainAgents =
      agentIds.length === 0
        ? []
        : await withServerRpcRetry(
            () =>
              publicClient.multicall({
                allowFailure: false,
                contracts: agentIds.map((agentId) => ({
                  address: getRegistryAddress(),
                  abi: registryAbi as Abi,
                  functionName: "agents",
                  args: [agentId]
                }))
              }) as Promise<OnchainAgent[]>
          );

    const agentsWithMetadata = agentIds
      .map((agentId, index) => serializeAgent(agentId, onchainAgents[index]))
      .filter((agent) => agent.active && !isInternalTestAgent(agent))
      .reverse();
    const agents = agentsWithMetadata.map((agent) => ({
      onchainAgentId: agent.onchainAgentId,
      ownerWallet: agent.ownerWallet,
      createdAt: agent.createdAt,
      active: agent.active,
      reputation: agent.reputation,
      completedJobs: agent.completedJobs,
      rejectedJobs: agent.rejectedJobs,
      totalEarned: agent.totalEarned,
      name: agent.name,
      description: agent.description,
      capabilities: agent.capabilities
    }));

    return NextResponse.json({
      ok: true,
      registryAddress: getRegistryAddress(),
      nextAgentId: nextAgentId.toString(),
      count: agents.length,
      agents
    });
  } catch {
    return NextResponse.json({ ok: false, error: "Unable to read Arc Testnet agents" }, { status: 500 });
  }
}
