import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { validateReviewDecision } from "../lib/evaluator-policy.mjs";
import { waitForTransactionReceiptWithRetry, withRpcRetry } from "./arc-rpc.mjs";

const defaultRpcUrl = "https://rpc.testnet.arc.network";
const defaultExplorerUrl = "https://testnet.arcscan.app";
const defaultEscrowAddress = "0x08eb8630f6b5d2c1c030688076b80360531a2e9a";
const defaultEscrowV2Address = "0x6255f3fbb7b4f82062b929029dc005baf0ca3ebb";
const defaultEscrowV3Address = "0x548531bbe48db4cded53da0d30998e7553eee53f";
const defaultEscrowV4Address = "0xb4791ed947067daf445c936ee44cedec949bdbb4";
const submittedStatus = 1;

function loadLocalEnv(rootDir) {
  const envPath = path.join(rootDir, ".env.local");
  if (!fs.existsSync(envPath)) {
    return;
  }

  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }

    const [key, ...parts] = trimmed.split("=");
    if (!process.env[key]) {
      process.env[key] = parts.join("=").replace(/^["']|["']$/g, "");
    }
  }
}

function normalizePrivateKey(value) {
  return value.startsWith("0x") ? value : `0x${value}`;
}

function sameHex(left, right) {
  return typeof left === "string" && typeof right === "string" && left.toLowerCase() === right.toLowerCase();
}

export async function settleReviewedJobs({
  reviewPath,
  live = false,
  rootDir = process.cwd()
}) {
  loadLocalEnv(rootDir);
  const rpcUrl = process.env.NEXT_PUBLIC_ARC_RPC_URL ?? defaultRpcUrl;
  const explorerUrl = (process.env.NEXT_PUBLIC_ARC_EXPLORER_URL ?? defaultExplorerUrl).replace(/\/+$/, "");
  const escrowV1Abi = JSON.parse(
    fs.readFileSync(path.join(rootDir, "lib/contracts/abis/ERC8183Escrow.json"), "utf8")
  );
  const escrowV2Abi = JSON.parse(
    fs.readFileSync(path.join(rootDir, "lib/contracts/abis/ERC8183EscrowV2.json"), "utf8")
  );
  const escrowContexts = {
    v1: {
      address: process.env.NEXT_PUBLIC_ERC8183_ESCROW_ADDRESS ?? defaultEscrowAddress,
      abi: escrowV1Abi
    },
    v2: {
      address: process.env.NEXT_PUBLIC_ERC8183_ESCROW_V2_ADDRESS ?? defaultEscrowV2Address,
      abi: escrowV2Abi
    },
    v3: {
      address: process.env.NEXT_PUBLIC_ERC8183_ESCROW_V3_ADDRESS ?? defaultEscrowV3Address,
      abi: escrowV2Abi
    },
    v4: {
      address: process.env.NEXT_PUBLIC_ERC8183_ESCROW_V4_ADDRESS ?? defaultEscrowV4Address,
      abi: escrowV2Abi
    }
  };
  const reviewDocument = JSON.parse(fs.readFileSync(reviewPath, "utf8"));
  const decisions = (reviewDocument.decisions ?? [])
    .filter((review) => review.statusAtReview === "SUBMITTED")
    .map(validateReviewDecision);
  const privateKey = live ? process.env.ARC_TESTNET_DEPLOYER_PRIVATE_KEY : undefined;

  if (live && !privateKey) {
    throw new Error("ARC_TESTNET_DEPLOYER_PRIVATE_KEY is required for --live settlement.");
  }

  const chain = defineChain({
    id: 5_042_002,
    name: "Arc Testnet",
    nativeCurrency: {
      name: "testnet USDC",
      symbol: "USDC",
      decimals: 18
    },
    rpcUrls: {
      default: {
        http: [rpcUrl]
      }
    },
    blockExplorers: {
      default: {
        name: "Arcscan",
        url: explorerUrl
      }
    },
    testnet: true
  });
  const publicClient = createPublicClient({
    chain,
    transport: http(rpcUrl)
  });
  const account = live ? privateKeyToAccount(normalizePrivateKey(privateKey)) : undefined;
  const walletClient = live
    ? createWalletClient({
        account,
        chain,
        transport: http(rpcUrl)
      })
    : undefined;
  const outcomes = [];

  for (const decision of decisions) {
    const jobId = BigInt(decision.jobId);
    const escrowVersion = decision.escrowVersion ?? reviewDocument.escrowVersion ?? "v1";
    const escrowContext = escrowContexts[escrowVersion];
    if (!escrowContext) {
      throw new Error(`Review ${decision.jobId} has unsupported escrowVersion ${escrowVersion}.`);
    }
    if (decision.action === "reject" && escrowVersion !== "v1") {
      throw new Error(
        `Review ${decision.jobId} cannot use legacy reject settlement on ${escrowVersion}; use revision or dispute flow.`
      );
    }
    const job = await withRpcRetry(() =>
      publicClient.readContract({
        address: escrowContext.address,
        abi: escrowContext.abi,
        functionName: "jobs",
        args: [jobId]
      })
    );

    if (Number(job[8]) !== submittedStatus) {
      outcomes.push({
        jobId: decision.jobId,
        escrowVersion,
        action: decision.action,
        status: "skipped",
        reason: `onchain status is ${Number(job[8])}, not SUBMITTED`
      });
      continue;
    }
    if (!sameHex(job[7], decision.deliverableHash)) {
      throw new Error(`Review ${decision.jobId} deliverable hash no longer matches onchain state.`);
    }
    if (live && !sameHex(job[3], account.address)) {
      throw new Error(`Review ${decision.jobId} evaluator does not match the settlement account.`);
    }

    if (!live) {
      outcomes.push({
        jobId: decision.jobId,
        escrowVersion,
        action: decision.action,
        status: "verified"
      });
      continue;
    }

    const functionName = decision.action === "accept" ? "acceptWork" : "rejectWork";
    const txHash = await walletClient.writeContract({
      address: escrowContext.address,
      abi: escrowContext.abi,
      functionName,
      args: [jobId]
    });
    const receipt = await waitForTransactionReceiptWithRetry(publicClient, txHash);
    if (receipt.status !== "success") {
      throw new Error(`Review ${decision.jobId} settlement reverted: ${txHash}`);
    }

    outcomes.push({
      jobId: decision.jobId,
      escrowVersion,
      action: decision.action,
      status: "settled",
      txHash,
      txUrl: `${explorerUrl}/tx/${txHash}`
    });
  }

  return outcomes;
}

async function main() {
  const rootDir = process.cwd();
  const live = process.argv.includes("--live");
  const reviewArgument = process.argv.find((value) => value.startsWith("--reviews="));
  const reviewPath = path.resolve(
    rootDir,
    reviewArgument?.slice("--reviews=".length) ?? "reviews/job-quality-review-2026-07-29.json"
  );
  const outcomes = await settleReviewedJobs({ reviewPath, live, rootDir });
  console.log(JSON.stringify({ live, outcomes }, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((caught) => {
    console.error(caught instanceof Error ? caught.message : caught);
    process.exitCode = 1;
  });
}
