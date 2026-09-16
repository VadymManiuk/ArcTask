import { ARC_MAINNET } from "@/lib/arc";
import { arcMainnet } from "@/lib/arc-chain";
import { contractAddresses, getOnchainReadiness, deploymentScope } from "@/lib/arc-config";
import { assertArcMainnet } from "@/lib/arc-network.mjs";
import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { createPublicClient, fallback, http } from "viem";
import { deliverableAccessTtlMs, getDeliverableAccessMessage } from "@/lib/deliverable-access";
import { getWorkerReportHash } from "@/lib/deliverable-integrity";
import { createDeliverableNonce, consumeDeliverableNonce, isDeliverableNonceValid } from "@/lib/server-deliverable-nonce";
import { isOnchainId, readBoundedJson } from "@/lib/request-validation";
import { rateLimit } from "@/lib/server-rate-limit";
import { requestWorkerJson } from "@/lib/server-worker-transport";
import { isSafeRemoteBaseUrl } from "@/lib/server-remote";
import { isRetryableRpcError, withServerRpcRetry } from "@/lib/server-rpc-retry";
import escrowAbi from "@/lib/contracts/abis/ERC8183Escrow.json";
import escrowV2Abi from "@/lib/contracts/abis/ERC8183EscrowV2.json";
import type { Address } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

const defaultEscrowAddress = contractAddresses.erc8183Escrow;
const defaultEscrowV2Address = contractAddresses.erc8183EscrowV2;
const defaultEscrowV3Address = contractAddresses.erc8183EscrowV3;
const defaultEscrowV4Address = contractAddresses.erc8183EscrowV4;
const v2InitialJobId = BigInt(process.env.NEXT_PUBLIC_ESCROW_V2_INITIAL_JOB_ID ?? "1000000");
const v3InitialJobId = BigInt(process.env.NEXT_PUBLIC_ESCROW_V3_INITIAL_JOB_ID ?? "2000000");
const v4InitialJobId = BigInt(process.env.NEXT_PUBLIC_ESCROW_V4_INITIAL_JOB_ID ?? "3000000");


const publicClient = createPublicClient({
  chain: arcMainnet,
  transport: fallback([...new Set([arcMainnet.rpcUrls.default.http[0], process.env.ARC_SECONDARY_RPC_URL || ARC_MAINNET.rpcUrl])]
    .map(url => http(url, { timeout: 4000, retryCount: 0 })), { retryCount: 0 })
});

interface WorkerDeliverableFile {
  jobId?: unknown;
  generatedAt?: unknown;
  deliverableHash?: unknown;
  txHash?: unknown;
  txUrl?: unknown;
  title?: unknown;
  mode?: unknown;
  model?: unknown;
  summary?: unknown;
  result?: {
    title?: unknown;
    mode?: unknown;
    model?: unknown;
    summary?: unknown;
    execution?: unknown;
  };
  executionPlan?: unknown;
}

interface DeliverableAccessProof {
  address: string;
  issuedAt: string;
  nonce: string;
  signature: string;
}

class DeliverableIntegrityError extends Error {}

function asString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function isAddress(value: string): value is Address {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

function sameAddress(left: string, right: string) {
  return left.toLowerCase() === right.toLowerCase();
}

function getRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function normalizeDeliverablePayload(value: unknown, jobId: string) {
  const envelope = getRecord(value);
  const sourceValue = envelope && "deliverable" in envelope ? envelope.deliverable : value;
  const source = getRecord(sourceValue) as WorkerDeliverableFile | null;
  const result = getRecord(source?.result);

  if (!source) {
    return null;
  }

  return {
    jobId,
    generatedAt: asString(source.generatedAt),
    deliverableHash: asString(source.deliverableHash),
    txHash: asString(source.txHash),
    txUrl: asString(source.txUrl),
    title: asString(source.title) ?? asString(result?.title) ?? `Job ${jobId} deliverable`,
    mode: asString(source.mode) ?? asString(result?.mode),
    model: asString(source.model) ?? asString(result?.model),
    summary: asString(source.summary) ?? asString(result?.summary) ?? "",
    executionPlan: getRecord(source.executionPlan),
    execution: getRecord(result?.execution)
  };
}

function getEscrowContext(jobId: string) {
  const numericJobId = BigInt(jobId);
  const isV4 = numericJobId >= v4InitialJobId;
  const isV3 = isV4 || numericJobId >= v3InitialJobId;
  const isV2 = isV3 || numericJobId >= v2InitialJobId;
  const address = (
    isV4
      ? process.env.NEXT_PUBLIC_ERC8183_ESCROW_V4_ADDRESS ?? defaultEscrowV4Address
      : isV3
        ? process.env.NEXT_PUBLIC_ERC8183_ESCROW_V3_ADDRESS ?? defaultEscrowV3Address
      : isV2
        ? process.env.NEXT_PUBLIC_ERC8183_ESCROW_V2_ADDRESS ?? defaultEscrowV2Address
        : process.env.NEXT_PUBLIC_ERC8183_ESCROW_ADDRESS ?? defaultEscrowAddress
  ) as Address | undefined;
  if (!address || !isAddress(address)) {
    throw new Error("Escrow contract is not configured.");
  }
  return { address, abi: isV2 ? escrowV2Abi : escrowAbi, isV2, isV3, isV4 };
}

async function getOnchainJob(jobId: string) {
  await withServerRpcRetry(() => assertArcMainnet(publicClient));
  const escrow = getEscrowContext(jobId);
  const job = (await withServerRpcRetry(() =>
    publicClient.readContract({
      address: escrow.address,
      abi: escrow.abi,
      functionName: "jobs",
      args: [BigInt(jobId)]
    })
  )) as readonly [Address, bigint, Address, Address, bigint, number, string, `0x${string}`, number, bigint, bigint];

  return {
    client: job[0],
    agentOwner: job[2],
    evaluator: job[3],
    deliverableHash: job[7],
    status: job[8],
    isV2: escrow.isV2,
    escrow
  };
}

async function assertDeliverableAccess(
  proof: DeliverableAccessProof,
  jobId: string
) {
  const address = proof.address.trim();
  const issuedAt = proof.issuedAt.trim();
  const nonce = proof.nonce.trim();
  const signature = proof.signature.trim();

  if (!isAddress(address) || !nonce || !signature) {
    return NextResponse.json({ error: "Wallet signature is required to view this deliverable." }, { status: 401 });
  }

  if (!isDeliverableNonceValid(jobId, nonce)) {
    return NextResponse.json({ error: "Deliverable access challenge expired. Sign again." }, { status: 401 });
  }

  const issuedAtMs = Date.parse(issuedAt);
  const now = Date.now();
  if (!Number.isFinite(issuedAtMs) || issuedAtMs > now + 60_000 || now - issuedAtMs > deliverableAccessTtlMs) {
    return NextResponse.json({ error: "Deliverable access signature expired. Sign again." }, { status: 401 });
  }

  let isValidSignature = false;
  try {
    isValidSignature = await publicClient.verifyMessage({
      address,
      mode: "eoa",
      message: getDeliverableAccessMessage(jobId, address, issuedAt, nonce),
      signature: signature as `0x${string}`
    });
  } catch (error) {
    if (isRetryableRpcError(error)) throw error;
    isValidSignature = false;
  }

  if (!isValidSignature) {
    return NextResponse.json({ error: "Invalid deliverable access signature." }, { status: 401 });
  }

  const job = await getOnchainJob(jobId);
  const isEvaluator = sameAddress(address, job.evaluator);
  const isAgentOwner = sameAddress(address, job.agentOwner);
  const isClient = sameAddress(address, job.client);
  const clientMayRead = !job.isV2 || job.status === 2 || isEvaluator;
  const agentMayRead = job.isV2 && (job.status === 3 || job.status === 5);
  if (!isEvaluator && !(isClient && clientMayRead) && !(isAgentOwner && agentMayRead)) {
    return NextResponse.json(
      {
        error: job.isV2
          ? "The evaluator can review the private result. The client receives access after acceptance; disputed work stays protected."
          : "Only the client or evaluator wallet can view this deliverable."
      },
      { status: 403 }
    );
  }

  const nonceDir = path.join(process.env.ARC_AGENT_STATE_DIR ?? path.join(process.cwd(), ".agent-worker", deploymentScope, "state"), "access-nonces");
  if (!consumeDeliverableNonce(jobId, nonce, nonceDir)) {
    return NextResponse.json({ error: "Deliverable access challenge already used. Sign again." }, { status: 401 });
  }
  return { deliverableHash: job.deliverableHash };
}

async function readLocalDeliverable(filePath: string, jobId: string, expectedHash: `0x${string}`) {
  const raw = await fs.readFile(filePath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  const storedReport = getRecord(parsed);
  if (!storedReport) {
    throw new Error("Invalid worker deliverable file.");
  }

  const calculatedHash = getWorkerReportHash(storedReport);
  const storedHash = asString(storedReport.deliverableHash);
  if (
    calculatedHash.toLowerCase() !== expectedHash.toLowerCase() ||
    storedHash?.toLowerCase() !== expectedHash.toLowerCase()
  ) {
    throw new DeliverableIntegrityError("Worker deliverable does not match the onchain hash.");
  }

  const deliverable = normalizeDeliverablePayload(parsed, jobId);
  if (!deliverable) {
    throw new Error("Invalid worker deliverable file.");
  }

  return deliverable;
}

async function forwardToWorker(request: Request, jobId: string, proof?: DeliverableAccessProof) {
  const base = process.env.ARCTASK_DELIVERABLE_REMOTE_BASE_URL;
  if (!base) return null;
  if (!isSafeRemoteBaseUrl(base) || new URL(base).origin === new URL(request.url).origin) {
    return NextResponse.json({ error: "Invalid worker endpoint configuration." }, { status: 503 });
  }
  try {
    const response = await requestWorkerJson(new URL(`/api/deliverables/${jobId}`, base), {
      method: proof ? "POST" : "GET", timeoutMs: 20_000,
      ...(proof ? { body: JSON.stringify(proof) } : {})
    });
    if (response.ok && response.headers.get("x-arctask-deployment") !== deploymentScope) {
      return NextResponse.json({ error: "Worker deployment mismatch." }, { status: 503 });
    }
    const payload = await response.json();
    return NextResponse.json(payload, { status: response.status, headers: {
      "Cache-Control": "private, no-store", "x-arctask-deployment": deploymentScope
    } });
  } catch {
    return NextResponse.json({ error: "Worker is temporarily unavailable. Try again shortly." }, { status: 503 });
  }
}

async function getProofFromRequest(request: Request): Promise<DeliverableAccessProof | null> {
  const body = (await readBoundedJson(request).catch(() => null)) as Partial<DeliverableAccessProof> | null;
  if (!body || typeof body.address !== "string" || typeof body.nonce !== "string" || typeof body.signature !== "string") {
    return null;
  }

  return {
    address: body.address,
    issuedAt: typeof body.issuedAt === "string" ? body.issuedAt : "",
    nonce: body.nonce,
    signature: body.signature
  };
}

export async function GET(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  if (!getOnchainReadiness().isReady) return NextResponse.json({ error: "Arc mainnet contracts are not configured." }, { status: 503 });
  const rateLimitResponse = rateLimit(request, { keyPrefix: "deliverable-challenge", limit: 20, windowMs: 60_000 });
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const jobId = (await params).jobId.trim();
  if (!isOnchainId(jobId)) {
    return NextResponse.json({ error: "Invalid onchain job ID." }, { status: 400 });
  }

  const remote = await forwardToWorker(request, jobId);
  if (remote) return remote;
  return NextResponse.json(createDeliverableNonce(jobId), { headers: {
    "Cache-Control": "private, no-store", "x-arctask-deployment": deploymentScope
  } });
}

export async function POST(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  if (!getOnchainReadiness().isReady) return NextResponse.json({ error: "Arc mainnet contracts are not configured." }, { status: 503 });
  if (request.headers.get("x-arctask-forwarded-wallet-proof") === "1" && request.headers.get("x-arctask-deployment") !== deploymentScope) {
    return NextResponse.json({ error: "Worker deployment mismatch." }, { status: 409 });
  }
  const rateLimitResponse = rateLimit(request, { keyPrefix: "deliverable-unlock", limit: 30, windowMs: 60_000 });
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const jobId = (await params).jobId.trim();
  if (!isOnchainId(jobId)) {
    return NextResponse.json({ error: "Invalid onchain job ID." }, { status: 400 });
  }

  const proof = await getProofFromRequest(request);
  if (!proof) return NextResponse.json({ error: "Wallet signature is required to view this deliverable." }, { status: 401 });
  const remote = await forwardToWorker(request, jobId, proof);
  if (remote) return remote;
  let expectedHash: `0x${string}`;
  try {
    const access = await assertDeliverableAccess(proof, jobId);
    if (access instanceof Response) return access;
    expectedHash = access.deliverableHash;
  } catch {
    return NextResponse.json({ error: "Unable to verify deliverable access. Try again shortly." }, { status: 503 });
  }

  const outputDir = process.env.ARC_AGENT_OUTPUT_DIR ?? path.join(process.cwd(), ".agent-worker", deploymentScope, "deliverables");
  const filePath = path.join(outputDir, `job-${jobId}.json`);

  try {
    return NextResponse.json({ deliverable: await readLocalDeliverable(filePath, jobId, expectedHash) }, {
      headers: { "x-arctask-deployment": deploymentScope, "Cache-Control": "private, no-store" }
    });
  } catch (caught) {
    if (caught instanceof DeliverableIntegrityError) {
      return NextResponse.json({ error: caught.message }, { status: 409 });
    }

    if ((caught as NodeJS.ErrnoException).code === "ENOENT") {
      return NextResponse.json(
        {
          error:
            "Worker deliverable was not found on this deployment. It is available only where the agent worker writes .agent-worker/deliverables."
        },
        { status: 404 }
      );
    }

    if (isRetryableRpcError(caught)) {
      return NextResponse.json(
        { error: "Arc Mainnet is temporarily unavailable. Try opening the deliverable again." },
        { status: 503 }
      );
    }

    return NextResponse.json({ error: "Unable to read worker deliverable." }, { status: 500 });
  }
}
