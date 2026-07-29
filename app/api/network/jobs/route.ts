import { NextResponse } from "next/server";
import { createPublicClient, defineChain, formatUnits, http, type Abi } from "viem";
import { ARC_TESTNET } from "@/lib/arc";
import { rateLimit } from "@/lib/server-rate-limit";
import { withServerRpcRetry } from "@/lib/server-rpc-retry";
import escrowAbi from "@/lib/contracts/abis/ERC8183Escrow.json";
import escrowV2Abi from "@/lib/contracts/abis/ERC8183EscrowV2.json";
import type { Address, JobStatus } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

const defaultEscrowAddress = "0x08eb8630f6b5d2c1c030688076b80360531a2e9a";
const defaultEscrowV2Address = "0x6255f3fbb7b4f82062b929029dc005baf0ca3ebb";
const v2InitialJobId = BigInt(process.env.NEXT_PUBLIC_ESCROW_V2_INITIAL_JOB_ID ?? "1000000");
const defaultSecondaryRpcUrl = "https://testnet.arcscan.app/api/eth-rpc";
const legacyStatuses: JobStatus[] = ["FUNDED", "SUBMITTED", "ACCEPTED", "REJECTED", "REFUNDED"];
const v2Statuses: JobStatus[] = ["FUNDED", "SUBMITTED", "ACCEPTED", "REJECTED", "REFUNDED", "DISPUTED"];
const freshCacheMs = 2_000;
const staleCacheMs = 15 * 60_000;
const cachedJobsResponses = new Map<number, { createdAt: number; payload: Record<string, unknown> }>();

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

function createRpcClient(url: string) {
  return createPublicClient({
    chain: arcTestnet,
    transport: http(url)
  });
}

const rpcClients = [
  {
    source: "primary",
    url: arcTestnet.rpcUrls.default.http[0]
  },
  {
    source: "arcscan",
    url: process.env.ARC_SECONDARY_RPC_URL ?? defaultSecondaryRpcUrl
  }
]
  .filter((entry, index, entries) => entries.findIndex((candidate) => candidate.url === entry.url) === index)
  .map((entry) => ({
    ...entry,
    client: createRpcClient(entry.url)
  }));

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

function getEscrowV2Address() {
  const address = process.env.NEXT_PUBLIC_ERC8183_ESCROW_V2_ADDRESS ?? defaultEscrowV2Address;
  return address && /^0x[a-fA-F0-9]{40}$/.test(address) ? (address as Address) : null;
}

function serializeJob(jobId: bigint, job: OnchainJob, isV2: boolean) {
  const payload = decodeJobPayload(job[6]);
  const status = (isV2 ? v2Statuses : legacyStatuses)[job[8]] ?? "FUNDED";

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

async function loadContractJobs(
  rpcClient: ReturnType<typeof createRpcClient>,
  address: Address,
  abi: Abi,
  firstPossibleJobId: bigint,
  limit: number,
  isV2: boolean
) {
  const nextJobId = await withServerRpcRetry(
    () =>
      rpcClient.readContract({
        address,
        abi,
        functionName: "nextJobId"
      }) as Promise<bigint>
  );
  const one = BigInt(1);
  const firstJobId =
    nextJobId - firstPossibleJobId > BigInt(limit) ? nextJobId - BigInt(limit) : firstPossibleJobId;
  const jobIds: bigint[] = [];
  for (let jobId = firstJobId; jobId < nextJobId; jobId += one) {
    jobIds.push(jobId);
  }
  const onchainJobs =
    jobIds.length === 0
      ? []
      : await withServerRpcRetry(
          () =>
            rpcClient.multicall({
              allowFailure: false,
              contracts: jobIds.map((jobId) => ({
                address,
                abi,
                functionName: "jobs",
                args: [jobId]
              }))
            }) as Promise<OnchainJob[]>
        );
  const jobs = jobIds
    .map((jobId, index) => serializeJob(jobId, onchainJobs[index], isV2))
    .filter((job) => !isInternalSmokeJob(job))
    .reverse();

  return { nextJobId, jobs };
}

async function loadJobsSnapshot(
  rpcClient: ReturnType<typeof createRpcClient>,
  source: string,
  limit: number
) {
  const v2Address = getEscrowV2Address();
  const [blockNumber, legacy, v2] = await Promise.all([
    withServerRpcRetry(() => rpcClient.getBlockNumber()),
    loadContractJobs(rpcClient, getEscrowAddress(), escrowAbi as Abi, BigInt(1), limit, false),
    v2Address
      ? loadContractJobs(rpcClient, v2Address, escrowV2Abi as Abi, v2InitialJobId, limit, true)
      : Promise.resolve({ nextJobId: v2InitialJobId, jobs: [] as ReturnType<typeof serializeJob>[] })
  ]);
  const jobs = [...v2.jobs, ...legacy.jobs]
    .sort((left, right) => Number(BigInt(right.createdAt) - BigInt(left.createdAt)))
    .slice(0, limit);

  return {
    source,
    blockNumber,
    nextJobId: v2Address ? v2.nextJobId : legacy.nextJobId,
    legacyNextJobId: legacy.nextJobId,
    jobs,
    terminalJobs: jobs.filter((job) => ["ACCEPTED", "REJECTED", "REFUNDED"].includes(job.status)).length,
    latestUpdatedAt: jobs.reduce(
      (latest, job) => (BigInt(job.updatedAt) > latest ? BigInt(job.updatedAt) : latest),
      BigInt(0)
    )
  };
}

function compareSnapshots(
  left: Awaited<ReturnType<typeof loadJobsSnapshot>>,
  right: Awaited<ReturnType<typeof loadJobsSnapshot>>
) {
  if (left.nextJobId !== right.nextJobId) {
    return left.nextJobId > right.nextJobId ? 1 : -1;
  }
  if (left.legacyNextJobId !== right.legacyNextJobId) {
    return left.legacyNextJobId > right.legacyNextJobId ? 1 : -1;
  }
  if (left.terminalJobs !== right.terminalJobs) {
    return left.terminalJobs > right.terminalJobs ? 1 : -1;
  }
  if (left.latestUpdatedAt !== right.latestUpdatedAt) {
    return left.latestUpdatedAt > right.latestUpdatedAt ? 1 : -1;
  }
  return left.blockNumber === right.blockNumber ? 0 : left.blockNumber > right.blockNumber ? 1 : -1;
}

const statusRanks: Record<JobStatus, number> = {
  FUNDED: 0,
  SUBMITTED: 1,
  DISPUTED: 2,
  ACCEPTED: 2,
  REJECTED: 2,
  REFUNDED: 2
};

function preserveMonotonicJobs(
  currentJobs: ReturnType<typeof serializeJob>[],
  previousJobs: ReturnType<typeof serializeJob>[]
) {
  const previousById = new Map(previousJobs.map((job) => [job.onchainJobId, job]));
  return currentJobs.map((job) => {
    const previous = previousById.get(job.onchainJobId);
    if (!previous) {
      return job;
    }
    if (statusRanks[previous.status] > statusRanks[job.status]) {
      return previous;
    }
    if (
      statusRanks[previous.status] === statusRanks[job.status] &&
      BigInt(previous.updatedAt) > BigInt(job.updatedAt)
    ) {
      return previous;
    }

    return job;
  });
}

export async function GET(request: Request) {
  const rateLimitResponse = rateLimit(request, { keyPrefix: "network-jobs", limit: 60, windowMs: 60_000 });
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const { searchParams } = new URL(request.url);
  const limitValue = Number(searchParams.get("limit") ?? 50);
  const limit = Number.isInteger(limitValue) && limitValue > 0 ? Math.min(limitValue, 100) : 50;
  const cachedJobsResponse = cachedJobsResponses.get(limit);
  const now = Date.now();
  if (cachedJobsResponse && now - cachedJobsResponse.createdAt < freshCacheMs) {
    return NextResponse.json(cachedJobsResponse.payload, {
      headers: {
        "Cache-Control": "no-store, max-age=0"
      }
    });
  }

  try {
    const snapshots = (
      await Promise.allSettled(
        rpcClients.map(({ client, source }) => loadJobsSnapshot(client, source, limit))
      )
    )
      .filter(
        (result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof loadJobsSnapshot>>> =>
          result.status === "fulfilled"
      )
      .map((result) => result.value);
    if (snapshots.length === 0) {
      throw new Error("No Arc RPC source returned a job snapshot.");
    }

    const selectedSnapshot = snapshots.sort(compareSnapshots).at(-1)!;
    const cachedJobs = Array.isArray(cachedJobsResponse?.payload.jobs)
      ? (cachedJobsResponse.payload.jobs as ReturnType<typeof serializeJob>[])
      : [];
    const cachedNextJobId = BigInt(String(cachedJobsResponse?.payload.nextJobId ?? 0));
    const cachedLegacyNextJobId = BigInt(String(cachedJobsResponse?.payload.legacyNextJobId ?? 0));
    if (
      cachedJobsResponse &&
      (cachedNextJobId > selectedSnapshot.nextJobId ||
        cachedLegacyNextJobId > selectedSnapshot.legacyNextJobId)
    ) {
      return NextResponse.json(
        {
          ...cachedJobsResponse.payload,
          stale: true,
          warning: "Preserved a newer confirmed Arc Testnet snapshot while RPC providers converged."
        },
        {
          headers: {
            "Cache-Control": "no-store, max-age=0",
            Warning: '110 - "Response is stale"'
          }
        }
      );
    }
    const jobs = preserveMonotonicJobs(selectedSnapshot.jobs, cachedJobs);
    const counts = jobs.reduce<Record<JobStatus, number>>(
      (acc, job) => {
        acc[job.status] += 1;
        return acc;
      },
      { FUNDED: 0, SUBMITTED: 0, ACCEPTED: 0, REJECTED: 0, REFUNDED: 0, DISPUTED: 0 }
    );

    const payload = {
      ok: true,
      source: selectedSnapshot.source,
      blockNumber: selectedSnapshot.blockNumber.toString(),
      escrowAddress: getEscrowV2Address() ?? getEscrowAddress(),
      legacyEscrowAddress: getEscrowAddress(),
      nextJobId: selectedSnapshot.nextJobId.toString(),
      legacyNextJobId: selectedSnapshot.legacyNextJobId.toString(),
      count: jobs.length,
      counts,
      jobs
    };
    cachedJobsResponses.set(limit, { createdAt: Date.now(), payload });

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "no-store, max-age=0"
      }
    });
  } catch {
    if (cachedJobsResponse && Date.now() - cachedJobsResponse.createdAt < staleCacheMs) {
      return NextResponse.json(
        {
          ...cachedJobsResponse.payload,
          stale: true,
          warning: "Showing the last confirmed Arc Testnet snapshot."
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
      { ok: false, error: "Unable to read Arc Testnet jobs" },
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
