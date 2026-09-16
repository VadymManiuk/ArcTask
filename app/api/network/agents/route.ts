import { arcMainnet } from "@/lib/arc-chain";
import { contractAddresses, getOnchainReadiness, deploymentScope } from "@/lib/arc-config";
import { assertArcMainnet } from "@/lib/arc-network.mjs";
import { NextResponse } from "next/server";
import { createPublicClient, formatUnits, http, type Abi } from "viem";
import { isEmbeddedAgentImage } from "@/lib/agent-image";
import { isOnchainId } from "@/lib/request-validation";
import { rateLimit } from "@/lib/server-rate-limit";
import { withServerRpcRetry } from "@/lib/server-rpc-retry";
import registryAbi from "@/lib/contracts/abis/ERC8004AgentRegistry.json";
import type { Address } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

const defaultRegistryAddress = contractAddresses.erc8004Registry;
const freshCacheMs = 15_000;
const staleCacheMs = 15 * 60_000;
const cachedAgentsResponses = new Map<string, { createdAt: number; payload: Record<string, unknown> }>();


const publicClient = createPublicClient({
  chain: arcMainnet,
  transport: http(arcMainnet.rpcUrls.default.http[0], { timeout: 4000, retryCount: 0 })
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
      image?: unknown;
    };

    const avatarUrl = isEmbeddedAgentImage(parsed.image) ? parsed.image : undefined;

    return {
      name: typeof parsed.name === "string" ? parsed.name.trim() : "",
      description: typeof parsed.description === "string" ? parsed.description.trim() : "",
      avatarUrl,
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
    totalEarned: Number(formatUnits(agent[7], arcMainnet.nativeCurrency.decimals)),
    name: metadata?.name || `Agent #${agentId.toString()}`,
    description: metadata?.description || "Autonomous agent registered on ArcTask.",
    avatarUrl: metadata?.avatarUrl,
    capabilities: metadata?.capabilities ?? []
  };
}

function isInternalTestAgent(agent: ReturnType<typeof serializeAgent>) {
  return agent.metadataURI.includes("/metadata/testnet-agent-");
}

export async function GET(request: Request) {
  if (!getOnchainReadiness().isReady) return NextResponse.json({ error: "Arc mainnet contracts are not configured." }, { status: 503 });
  const rateLimitResponse = rateLimit(request, { keyPrefix: "network-agents", limit: 60, windowMs: 60_000 });
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const { searchParams } = new URL(request.url);
  const requestedId = searchParams.get("agentId");
  if (requestedId !== null && !isOnchainId(requestedId)) return NextResponse.json({ error: "Invalid agentId." }, { status: 400 });
  const limitValue = Number(searchParams.get("limit") ?? 100);
  const limit = Number.isInteger(limitValue) && limitValue > 0 ? Math.min(limitValue, 100) : 100;
  const cachedAgentsResponse = cachedAgentsResponses.get(`${limit}:${requestedId ?? ""}`);
  const now = Date.now();
  if (cachedAgentsResponse && now - cachedAgentsResponse.createdAt < freshCacheMs) {
    return NextResponse.json(cachedAgentsResponse.payload, {
      headers: {
        "Cache-Control": "no-store, max-age=0"
      }
    });
  }

  try {
    await assertArcMainnet(publicClient);
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

    if (requestedId) {
      agentIds.length = 0;
      if (BigInt(requestedId) < nextAgentId) agentIds.push(BigInt(requestedId));
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
      avatarUrl: agent.avatarUrl,
      capabilities: agent.capabilities
    }));

    const payload = {
      ok: true,
      deploymentScope,
      registryAddress: getRegistryAddress(),
      nextAgentId: nextAgentId.toString(),
      count: agents.length,
      agents
    };
    if (cachedAgentsResponses.size >= 200) cachedAgentsResponses.delete(cachedAgentsResponses.keys().next().value!);
    cachedAgentsResponses.set(`${limit}:${requestedId ?? ""}`, { createdAt: Date.now(), payload });

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "no-store, max-age=0"
      }
    });
  } catch {
    if (cachedAgentsResponse && Date.now() - cachedAgentsResponse.createdAt < staleCacheMs) {
      return NextResponse.json(
        {
          ...cachedAgentsResponse.payload,
          stale: true,
          warning: "Showing the last confirmed Arc Mainnet snapshot."
        },
        {
          headers: {
            "Cache-Control": "no-store, max-age=0",
            Warning: '110 - "Response is stale"'
          }
        }
      );
    }

    return NextResponse.json(
      { ok: false, error: "Unable to read Arc Mainnet agents" },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store, max-age=0",
          "Retry-After": "3"
        }
      }
    );
  }
}
