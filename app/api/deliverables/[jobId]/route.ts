import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { createPublicClient, defineChain, http, verifyMessage } from "viem";
import { ARC_TESTNET } from "@/lib/arc";
import { deliverableAccessTtlMs, getDeliverableAccessMessage } from "@/lib/deliverable-access";
import escrowAbi from "@/lib/contracts/abis/ERC8183Escrow.json";
import type { Address } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const defaultEscrowAddress = "0xa01556ed349afc5de844bd0bb10ba6ed8808aaea";

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
  generatedAt?: unknown;
  deliverableHash?: unknown;
  txHash?: unknown;
  txUrl?: unknown;
  result?: {
    title?: unknown;
    mode?: unknown;
    model?: unknown;
    summary?: unknown;
  };
}

interface DeliverableAccessProof {
  address: string;
  issuedAt: string;
  signature: string;
}

function asString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function isAddress(value: string): value is Address {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

function sameAddress(left: string, right: string) {
  return left.toLowerCase() === right.toLowerCase();
}

async function getOnchainClientWallet(jobId: string) {
  const escrowAddress = (process.env.NEXT_PUBLIC_ERC8183_ESCROW_ADDRESS ?? defaultEscrowAddress) as Address;
  const job = (await publicClient.readContract({
    address: escrowAddress,
    abi: escrowAbi,
    functionName: "jobs",
    args: [BigInt(jobId)]
  })) as readonly [Address, bigint, Address, Address, bigint, number, string, `0x${string}`, number, bigint, bigint];

  return job[0];
}

async function assertDeliverableAccess(proof: DeliverableAccessProof, jobId: string) {
  const address = proof.address.trim();
  const issuedAt = proof.issuedAt.trim();
  const signature = proof.signature.trim();

  if (!isAddress(address) || !signature) {
    return NextResponse.json({ error: "Wallet signature is required to view this deliverable." }, { status: 401 });
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
      message: getDeliverableAccessMessage(jobId, address, issuedAt),
      signature: signature as `0x${string}`
    });
  } catch {
    isValidSignature = false;
  }

  if (!isValidSignature) {
    return NextResponse.json({ error: "Invalid deliverable access signature." }, { status: 401 });
  }

  const clientWallet = await getOnchainClientWallet(jobId);
  if (!sameAddress(address, clientWallet)) {
    return NextResponse.json({ error: "Only the wallet that created this job can view the deliverable." }, { status: 403 });
  }

  return null;
}

async function readLocalDeliverable(filePath: string, jobId: string) {
  const raw = await fs.readFile(filePath, "utf8");
  const parsed = JSON.parse(raw) as WorkerDeliverableFile;

  return {
    jobId,
    generatedAt: asString(parsed.generatedAt),
    deliverableHash: asString(parsed.deliverableHash),
    txHash: asString(parsed.txHash),
    txUrl: asString(parsed.txUrl),
    title: asString(parsed.result?.title) ?? `Job ${jobId} deliverable`,
    mode: asString(parsed.result?.mode),
    model: asString(parsed.result?.model),
    summary: asString(parsed.result?.summary) ?? ""
  };
}

async function fetchRemoteDeliverable(request: Request, jobId: string, proof: DeliverableAccessProof) {
  const remoteBaseUrl = process.env.ARCTASK_DELIVERABLE_REMOTE_BASE_URL;
  if (!remoteBaseUrl) {
    return null;
  }

  const remoteUrl = new URL(`/api/deliverables/${jobId}`, remoteBaseUrl);
  if (remoteUrl.origin === new URL(request.url).origin) {
    return null;
  }

  const response = await fetch(remoteUrl, {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(proof)
  });
  if (!response.ok) {
    return null;
  }

  return response.json() as Promise<unknown>;
}

async function getProofFromRequest(request: Request): Promise<DeliverableAccessProof | null> {
  const body = (await request.json().catch(() => null)) as Partial<DeliverableAccessProof> | null;
  if (!body || typeof body.address !== "string" || typeof body.signature !== "string") {
    return null;
  }

  return {
    address: body.address,
    issuedAt: typeof body.issuedAt === "string" ? body.issuedAt : "",
    signature: body.signature
  };
}

export async function GET() {
  return NextResponse.json({ error: "Use POST with a wallet signature to view this deliverable." }, { status: 401 });
}

export async function POST(request: Request, { params }: { params: { jobId: string } }) {
  const jobId = params.jobId.trim();
  if (!/^\d+$/.test(jobId)) {
    return NextResponse.json({ error: "Invalid onchain job ID." }, { status: 400 });
  }

  const proof = await getProofFromRequest(request);
  if (!proof) {
    return NextResponse.json({ error: "Wallet signature is required to view this deliverable." }, { status: 401 });
  }

  const accessError = await assertDeliverableAccess(proof, jobId);
  if (accessError) {
    return accessError;
  }

  const outputDir = process.env.ARC_AGENT_OUTPUT_DIR ?? path.join(process.cwd(), ".agent-worker", "deliverables");
  const filePath = path.join(outputDir, `job-${jobId}.json`);

  try {
    return NextResponse.json({ deliverable: await readLocalDeliverable(filePath, jobId) });
  } catch (caught) {
    if ((caught as NodeJS.ErrnoException).code === "ENOENT") {
      const remoteDeliverable = await fetchRemoteDeliverable(request, jobId, proof);
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

    return NextResponse.json({ error: "Unable to read worker deliverable." }, { status: 500 });
  }
}
