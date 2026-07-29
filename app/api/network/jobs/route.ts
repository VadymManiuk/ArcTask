import { NextResponse } from "next/server";
import { createPublicClient, defineChain, formatUnits, http, type Abi } from "viem";
import { ARC_TESTNET } from "@/lib/arc";
import { rateLimit } from "@/lib/server-rate-limit";
import { withServerRpcRetry } from "@/lib/server-rpc-retry";
import escrowAbi from "@/lib/contracts/abis/ERC8183Escrow.json";
import type { Address, JobStatus } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

const defaultEscrowAddress = "0x08eb8630f6b5d2c1c030688076b80360531a2e9a";
const statuses: JobStatus[] = ["FUNDED", "SUBMITTED", "ACCEPTED", "REJECTED", "REFUNDED"];

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

type OnchainJob = readonly [
  Address,
  bigint,
  Address,
  Address,
  bigint,
  number,
  string,
  `0x${string}`,
  number,
  bigint,
  bigint
];

function decodeJobPayload(jobURI: string) {
  if (!jobURI.startsWith("data:application/json,")) {
    return null;
  }

  try {
    return JSON.parse(decodeURIComponent(jobURI.slice("data:application/json,".length))) as {
      title?: unknown;
      description?: unknown;
      localAgentId?: unknown;
    };
  } catch {
    return null;
  }
}

function getEscrowAddress() {
  return (process.env.NEXT_PUBLIC_ERC8183_ESCROW_ADDRESS ?? defaultEscrowAddress) as Address;
}

function serializeJob(jobId: bigint, job: OnchainJob) {
  const payload = decodeJobPayload(job[6]);
  const status = statuses[job[8]] ?? "FUNDED";

  return {
    onchainJobId: jobId.toString(),
    title: typeof payload?.title === "string" ? payload.title : `ArcTask job ${jobId.toString()}`,
    description: typeof payload?.description === "string" ? payload.description : "",
    localAgentId: typeof payload?.localAgentId === "string" ? payload.localAgentId : undefined,
    clientWallet: job[0],
    onchainAgentId: job[1].toString(),
    agentOwnerWallet: job[2],
    evaluatorWallet: job[3],
    rewardAmount: job[4].toString(),
    rewardDisplay: `${formatUnits(job[4], arcTestnet.nativeCurrency.decimals)} USDC`,
    deadline: Number(job[5]),
    deliverableHash: job[7],
    status,
    createdAt: job[9].toString(),
    updatedAt: job[10].toString()
  };
}

function isInternalSmokeJob(job: ReturnType<typeof serializeJob>) {
  return /\bsmoke\b/i.test(`${job.title} ${job.description}`);
}

export async function GET(request: Request) {
  const rateLimitResponse = rateLimit(request, { keyPrefix: "network-jobs", limit: 60, windowMs: 60_000 });
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const { searchParams } = new URL(request.url);
  const limitValue = Number(searchParams.get("limit") ?? 50);
  const limit = Number.isInteger(limitValue) && limitValue > 0 ? Math.min(limitValue, 100) : 50;

  try {
    const nextJobId = await withServerRpcRetry(
      () =>
        publicClient.readContract({
          address: getEscrowAddress(),
          abi: escrowAbi,
          functionName: "nextJobId"
        }) as Promise<bigint>
    );
    const one = BigInt(1);
    const firstJobId = nextJobId > BigInt(limit) ? nextJobId - BigInt(limit) : one;
    const jobIds: bigint[] = [];
    for (let jobId = firstJobId; jobId < nextJobId; jobId += one) {
      jobIds.push(jobId);
    }

    const onchainJobs =
      jobIds.length === 0
        ? []
        : await withServerRpcRetry(
            () =>
              publicClient.multicall({
                allowFailure: false,
                contracts: jobIds.map((jobId) => ({
                  address: getEscrowAddress(),
                  abi: escrowAbi as Abi,
                  functionName: "jobs",
                  args: [jobId]
                }))
              }) as Promise<OnchainJob[]>
          );
    const jobs = jobIds
      .map((jobId, index) => serializeJob(jobId, onchainJobs[index]))
      .filter((job) => !isInternalSmokeJob(job))
      .reverse();
    const counts = jobs.reduce<Record<JobStatus, number>>(
      (acc, job) => {
        acc[job.status] += 1;
        return acc;
      },
      { FUNDED: 0, SUBMITTED: 0, ACCEPTED: 0, REJECTED: 0, REFUNDED: 0 }
    );

    return NextResponse.json({
      ok: true,
      escrowAddress: getEscrowAddress(),
      nextJobId: nextJobId.toString(),
      count: jobs.length,
      counts,
      jobs
    }, {
      headers: {
        "Cache-Control": "no-store, max-age=0"
      }
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Unable to read Arc Testnet jobs" },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store, max-age=0"
        }
      }
    );
  }
}
