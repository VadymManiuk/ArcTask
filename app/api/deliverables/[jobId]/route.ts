import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { createPublicClient, defineChain, http, verifyMessage } from "viem";
import { ARC_TESTNET } from "@/lib/arc";
import { deliverableAccessTtlMs, getDeliverableAccessMessage } from "@/lib/deliverable-access";
import { getWorkerReportHash } from "@/lib/deliverable-integrity";
import { createDeliverableNonce, consumeDeliverableNonce } from "@/lib/server-deliverable-nonce";
import { rateLimit } from "@/lib/server-rate-limit";
import { isSafeRemoteBaseUrl } from "@/lib/server-remote";
import { isRetryableRpcError, withServerRpcRetry } from "@/lib/server-rpc-retry";
import escrowAbi from "@/lib/contracts/abis/ERC8183Escrow.json";
import escrowV2Abi from "@/lib/contracts/abis/ERC8183EscrowV2.json";
import type { Address } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const defaultEscrowAddress = "0x08eb8630f6b5d2c1c030688076b80360531a2e9a";
const defaultEscrowV2Address = "0x6255f3fbb7b4f82062b929029dc005baf0ca3ebb";
const defaultEscrowV3Address = "0x548531bbe48db4cded53da0d30998e7553eee53f";
const v2InitialJobId = BigInt(process.env.NEXT_PUBLIC_ESCROW_V2_INITIAL_JOB_ID ?? "1000000");
const v3InitialJobId = BigInt(process.env.NEXT_PUBLIC_ESCROW_V3_INITIAL_JOB_ID ?? "2000000");

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
  testnet: true
});

const publicClient = createPublicClient({
  chain: arcTestnet,
  transport: http(arcTestnet.rpcUrls.default.http[0])
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

function isTrustedRemoteRequest(request: Request) {
  const token = process.env.ARCTASK_DELIVERABLE_REMOTE_TOKEN;
  if (!token) {
    return false;
  }

  return request.headers.get("x-arctask-remote-token") === token;
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
  const isV3 = numericJobId >= v3InitialJobId;
  const isV2 = isV3 || numericJobId >= v2InitialJobId;
  const address = (
    isV3
      ? process.env.NEXT_PUBLIC_ERC8183_ESCROW_V3_ADDRESS ?? defaultEscrowV3Address
      : isV2
      ? process.env.NEXT_PUBLIC_ERC8183_ESCROW_V2_ADDRESS ?? defaultEscrowV2Address
      : process.env.NEXT_PUBLIC_ERC8183_ESCROW_ADDRESS ?? defaultEscrowAddress
  ) as Address | undefined;
  if (!address || !isAddress(address)) {
    throw new Error("Escrow contract is not configured.");
  }
  return { address, abi: isV2 ? escrowV2Abi : escrowAbi, isV2, isV3 };
}

async function getOnchainJob(jobId: string) {
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

async function getOnchainDeliverableHash(jobId: string) {
  return (await getOnchainJob(jobId)).deliverableHash;
}

async function assertDeliverableAccess(
  proof: DeliverableAccessProof,
  jobId: string,
  options: { consumeNonce?: boolean } = {}
) {
  const address = proof.address.trim();
  const issuedAt = proof.issuedAt.trim();
  const nonce = proof.nonce.trim();
  const signature = proof.signature.trim();

  if (!isAddress(address) || !nonce || !signature) {
    return NextResponse.json({ error: "Wallet signature is required to view this deliverable." }, { status: 401 });
  }

  if (options.consumeNonce !== false && !consumeDeliverableNonce(jobId, nonce)) {
    return NextResponse.json({ error: "Deliverable access challenge expired. Sign again." }, { status: 401 });
  }

  const issuedAtMs = Date.parse(issuedAt);
  const now = Date.now();
  if (!Number.isFinite(issuedAtMs) || issuedAtMs > now + 60_000 || now - issuedAtMs > deliverableAccessTtlMs) {
    return NextResponse.json({ error: "Deliverable access signature expired. Sign again." }, { status: 401 });
  }

  let isValidSignature = false;
  try {
    isValidSignature = await verifyMessage({
      address,
      message: getDeliverableAccessMessage(jobId, address, issuedAt, nonce),
      signature: signature as `0x${string}`
    });
  } catch {
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

  return null;
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

async function fetchRemoteDeliverable(request: Request, jobId: string, proof: DeliverableAccessProof) {
  const remoteBaseUrl = process.env.ARCTASK_DELIVERABLE_REMOTE_BASE_URL;
  if (!remoteBaseUrl || !isSafeRemoteBaseUrl(remoteBaseUrl)) {
    return null;
  }

  const remoteUrl = new URL(`/api/deliverables/${jobId}`, remoteBaseUrl);
  if (remoteUrl.origin === new URL(request.url).origin) {
    return null;
  }

  try {
    const response = await fetch(remoteUrl, {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        "x-arctask-forwarded-wallet-proof": "1",
        ...(process.env.ARCTASK_DELIVERABLE_REMOTE_TOKEN
          ? { "x-arctask-remote-token": process.env.ARCTASK_DELIVERABLE_REMOTE_TOKEN }
          : {})
      },
      body: JSON.stringify(proof)
    });
    if (!response.ok) {
      return null;
    }

    const deliverable = normalizeDeliverablePayload(await response.json().catch(() => null), jobId);
    return deliverable ? { deliverable } : null;
  } catch {
    return null;
  }
}

async function getProofFromRequest(request: Request): Promise<DeliverableAccessProof | null> {
  const body = (await request.json().catch(() => null)) as Partial<DeliverableAccessProof> | null;
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

export async function GET(request: Request, { params }: { params: { jobId: string } }) {
  const rateLimitResponse = rateLimit(request, { keyPrefix: "deliverable-challenge", limit: 20, windowMs: 60_000 });
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const jobId = params.jobId.trim();
  if (!/^\d+$/.test(jobId)) {
    return NextResponse.json({ error: "Invalid onchain job ID." }, { status: 400 });
  }

  return NextResponse.json(createDeliverableNonce(jobId));
}

export async function POST(request: Request, { params }: { params: { jobId: string } }) {
  const rateLimitResponse = rateLimit(request, { keyPrefix: "deliverable-unlock", limit: 30, windowMs: 60_000 });
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const jobId = params.jobId.trim();
  if (!/^\d+$/.test(jobId)) {
    return NextResponse.json({ error: "Invalid onchain job ID." }, { status: 400 });
  }

  const trustedRemoteRequest = isTrustedRemoteRequest(request);
  const forwardedWalletProof = request.headers.get("x-arctask-forwarded-wallet-proof") === "1";
  const proof = trustedRemoteRequest ? null : await getProofFromRequest(request);
  if (!trustedRemoteRequest) {
    if (!proof) {
      return NextResponse.json({ error: "Wallet signature is required to view this deliverable." }, { status: 401 });
    }

    try {
      const accessError = await assertDeliverableAccess(proof, jobId, {
        // The public deployment already consumed this one-time challenge before
        // forwarding the signed proof to the worker deployment. The worker still
        // verifies the signature, timestamp, and onchain client wallet.
        consumeNonce: !forwardedWalletProof
      });
      if (accessError) {
        return accessError;
      }
    } catch (caught) {
      return NextResponse.json(
        {
          error: isRetryableRpcError(caught)
            ? "Arc Testnet is temporarily unavailable. Try opening the deliverable again."
            : "Unable to verify deliverable access."
        },
        { status: 503 }
      );
    }
  }

  const outputDir = process.env.ARC_AGENT_OUTPUT_DIR ?? path.join(process.cwd(), ".agent-worker", "deliverables");
  const filePath = path.join(outputDir, `job-${jobId}.json`);

  try {
    const expectedHash = await getOnchainDeliverableHash(jobId);
    return NextResponse.json({ deliverable: await readLocalDeliverable(filePath, jobId, expectedHash) });
  } catch (caught) {
    if (caught instanceof DeliverableIntegrityError) {
      return NextResponse.json({ error: caught.message }, { status: 409 });
    }

    if ((caught as NodeJS.ErrnoException).code === "ENOENT") {
      const remoteDeliverable = proof ? await fetchRemoteDeliverable(request, jobId, proof) : null;
      if (remoteDeliverable) {
        return NextResponse.json(remoteDeliverable);
      }

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
        { error: "Arc Testnet is temporarily unavailable. Try opening the deliverable again." },
        { status: 503 }
      );
    }

    return NextResponse.json({ error: "Unable to read worker deliverable." }, { status: 500 });
  }
}
