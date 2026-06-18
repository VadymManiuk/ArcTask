import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { createPublicClient, defineChain, http, verifyMessage } from "viem";
import { ARC_TESTNET } from "@/lib/arc";
import { getDeliverableAccessMessage } from "@/lib/deliverable-access";
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

async function assertDeliverableAccess(request: Request, jobId: string) {
  const url = new URL(request.url);
  const address = url.searchParams.get("address")?.trim() ?? "";
  const signature = url.searchParams.get("signature")?.trim() ?? "";

  if (!isAddress(address) || !signature) {
    return NextResponse.json({ error: "Wallet signature is required to view this deliverable." }, { status: 401 });
  }

  let isValidSignature = false;
  try {
    isValidSignature = await verifyMessage({
      address,
      message: getDeliverableAccessMessage(jobId, address),
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

async function fetchRemoteDeliverable(request: Request, jobId: string) {
  const remoteBaseUrl = process.env.ARCTASK_DELIVERABLE_REMOTE_BASE_URL;
  if (!remoteBaseUrl) {
    return null;
  }

  const remoteUrl = new URL(`/api/deliverables/${jobId}`, remoteBaseUrl);
  const requestUrl = new URL(request.url);
  for (const key of ["address", "signature"]) {
    const value = requestUrl.searchParams.get(key);
    if (value) {
      remoteUrl.searchParams.set(key, value);
    }
  }

  if (remoteUrl.origin === new URL(request.url).origin) {
    return null;
  }

  const response = await fetch(remoteUrl, { cache: "no-store" });
  if (!response.ok) {
    return null;
  }

  return response.json() as Promise<unknown>;
}

export async function GET(request: Request, { params }: { params: { jobId: string } }) {
  const jobId = params.jobId.trim();
  if (!/^\d+$/.test(jobId)) {
    return NextResponse.json({ error: "Invalid onchain job ID." }, { status: 400 });
  }

  const accessError = await assertDeliverableAccess(request, jobId);
  if (accessError) {
    return accessError;
  }

  const outputDir = process.env.ARC_AGENT_OUTPUT_DIR ?? path.join(process.cwd(), ".agent-worker", "deliverables");
  const filePath = path.join(outputDir, `job-${jobId}.json`);

  try {
    return NextResponse.json({ deliverable: await readLocalDeliverable(filePath, jobId) });
  } catch (caught) {
    if ((caught as NodeJS.ErrnoException).code === "ENOENT") {
      const remoteDeliverable = await fetchRemoteDeliverable(request, jobId);
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
