import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  formatUnits,
  http,
  keccak256,
  stringToHex
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const rootDir = process.cwd();
const defaultRegistryAddress = "0xe69e88cb35a831fca783ac56405831478fdbaa41";
const defaultEscrowAddress = "0x2b3e0b7a7d96f8199fe31b2867358990430b5181";
const defaultRpcUrl = "https://rpc.testnet.arc.network";
const defaultExplorerUrl = "https://testnet.arcscan.app";
const fundedStatus = 0;

function loadLocalEnv() {
  const envPath = path.join(rootDir, ".env.local");
  if (!fs.existsSync(envPath)) {
    return;
  }

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
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

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required. Add it to .env.local or export it before running the worker.`);
  }

  return value;
}

function optionalAddress(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (!/^0x[a-fA-F0-9]{40}$/.test(value)) {
    throw new Error(`${name} must be a valid 0x address.`);
  }

  return value;
}

function normalizePrivateKey(value) {
  return value.startsWith("0x") ? value : `0x${value}`;
}

function readAbi(fileName) {
  return JSON.parse(fs.readFileSync(path.join(rootDir, "lib/contracts/abis", fileName), "utf8"));
}

function getBooleanEnv(name, defaultValue) {
  const value = process.env[name];
  if (value === undefined) {
    return defaultValue;
  }

  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function getPositiveIntegerEnv(name, defaultValue) {
  const value = Number(process.env[name] ?? defaultValue);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return value;
}

function sameAddress(left, right) {
  return left.toLowerCase() === right.toLowerCase();
}

function serializeBigInts(value) {
  return JSON.stringify(
    value,
    (_, nestedValue) => (typeof nestedValue === "bigint" ? nestedValue.toString() : nestedValue),
    2
  );
}

function buildDeliverable(jobId, job, accountAddress, explorerUrl) {
  const report = {
    kind: "ArcTask autonomous agent deliverable",
    version: 1,
    generatedAt: new Date().toISOString(),
    worker: accountAddress,
    job: {
      jobId: jobId.toString(),
      agentId: job.agentId.toString(),
      client: job.client,
      agentOwner: job.agentOwner,
      evaluator: job.evaluator,
      rewardAmount: job.rewardAmount.toString(),
      rewardDisplay: `${formatUnits(job.rewardAmount, 18)} USDC`,
      deadline: Number(job.deadline),
      deadlineIso: new Date(Number(job.deadline) * 1000).toISOString(),
      explorer: `${explorerUrl}/address/${escrowAddress}`
    },
    result: {
      status: "completed",
      summary:
        "Autonomous worker detected the funded ArcTask escrow, generated this deterministic completion report, and prepared an onchain deliverable hash for evaluator review."
    }
  };
  const content = serializeBigInts(report);
  return {
    content,
    hash: keccak256(stringToHex(content)),
    report
  };
}

function ensureOutputDir() {
  const outputDir = process.env.ARC_AGENT_OUTPUT_DIR ?? path.join(rootDir, ".agent-worker", "deliverables");
  fs.mkdirSync(outputDir, { recursive: true });
  return outputDir;
}

function writeDeliverable(outputDir, jobId, deliverable, txHash) {
  const filePath = path.join(outputDir, `job-${jobId.toString()}.json`);
  fs.writeFileSync(
    filePath,
    serializeBigInts({
      ...deliverable.report,
      deliverableHash: deliverable.hash,
      txHash,
      txUrl: txHash ? `${explorerUrl}/tx/${txHash}` : undefined
    })
  );
  return filePath;
}

async function readJob(jobId) {
  const result = await publicClient.readContract({
    address: escrowAddress,
    abi: escrowAbi,
    functionName: "jobs",
    args: [jobId]
  });

  return {
    client: result[0],
    agentId: result[1],
    agentOwner: result[2],
    evaluator: result[3],
    rewardAmount: result[4],
    deadline: result[5],
    deliverableHash: result[6],
    status: result[7],
    createdAt: result[8],
    updatedAt: result[9]
  };
}

async function submitJob(jobId, job, outputDir, dryRun) {
  const nowSeconds = BigInt(Math.floor(Date.now() / 1000));
  if (job.deadline <= nowSeconds) {
    console.log(`skip job ${jobId}: deadline expired`);
    return false;
  }

  const deliverable = buildDeliverable(jobId, job, account.address, explorerUrl);
  if (dryRun) {
    const filePath = writeDeliverable(outputDir, jobId, deliverable);
    console.log(`dry-run job ${jobId}: would submit ${deliverable.hash}`);
    console.log(`saved ${path.relative(rootDir, filePath)}`);
    return true;
  }

  const txHash = await walletClient.writeContract({
    address: escrowAddress,
    abi: escrowAbi,
    functionName: "submitDeliverable",
    args: [jobId, deliverable.hash]
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  if (receipt.status !== "success") {
    throw new Error(`submitDeliverable failed for job ${jobId}: ${txHash}`);
  }

  const filePath = writeDeliverable(outputDir, jobId, deliverable, txHash);
  console.log(`submitted job ${jobId}: ${txHash}`);
  console.log(`saved ${path.relative(rootDir, filePath)}`);
  return true;
}

async function scanOnce({ dryRun, maxJobsPerTick, outputDir }) {
  const nextJobId = await publicClient.readContract({
    address: escrowAddress,
    abi: escrowAbi,
    functionName: "nextJobId"
  });
  let handled = 0;

  for (let jobId = 1n; jobId < nextJobId; jobId += 1n) {
    const job = await readJob(jobId);
    if (job.status !== fundedStatus || !sameAddress(job.agentOwner, account.address)) {
      continue;
    }

    await submitJob(jobId, job, outputDir, dryRun);
    handled += 1;
    if (handled >= maxJobsPerTick) {
      break;
    }
  }

  if (handled === 0) {
    console.log(`no funded jobs for ${account.address}`);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

loadLocalEnv();

const privateKey =
  process.env.ARC_AGENT_PRIVATE_KEY ??
  process.env.ARC_TESTNET_DEPLOYER_PRIVATE_KEY ??
  requiredEnv("ARC_AGENT_PRIVATE_KEY");
const rpcUrl = process.env.NEXT_PUBLIC_ARC_RPC_URL ?? defaultRpcUrl;
const explorerUrl = process.env.NEXT_PUBLIC_ARC_EXPLORER_URL ?? defaultExplorerUrl;
const escrowAddress = optionalAddress("NEXT_PUBLIC_ERC8183_ESCROW_ADDRESS", defaultEscrowAddress);
optionalAddress("NEXT_PUBLIC_ERC8004_REGISTRY_ADDRESS", defaultRegistryAddress);
const dryRun = getBooleanEnv("ARC_AGENT_DRY_RUN", true);
const once = getBooleanEnv("ARC_AGENT_ONCE", false);
const pollIntervalMs = getPositiveIntegerEnv("ARC_AGENT_POLL_INTERVAL_MS", 15_000);
const maxJobsPerTick = getPositiveIntegerEnv("ARC_AGENT_MAX_JOBS_PER_TICK", 5);

const arcTestnet = defineChain({
  id: 5042002,
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

const account = privateKeyToAccount(normalizePrivateKey(privateKey));
const escrowAbi = readAbi("ERC8183Escrow.json");
const publicClient = createPublicClient({
  chain: arcTestnet,
  transport: http(rpcUrl)
});
const walletClient = createWalletClient({
  account,
  chain: arcTestnet,
  transport: http(rpcUrl)
});
const outputDir = ensureOutputDir();

console.log(`ArcTask agent worker`);
console.log(`account: ${account.address}`);
console.log(`escrow: ${escrowAddress}`);
console.log(`mode: ${dryRun ? "dry-run" : "live"}`);

if (!process.env.ARC_AGENT_PRIVATE_KEY && process.env.ARC_TESTNET_DEPLOYER_PRIVATE_KEY) {
  console.log("warning: using ARC_TESTNET_DEPLOYER_PRIVATE_KEY fallback; set ARC_AGENT_PRIVATE_KEY for production.");
}

do {
  try {
    await scanOnce({ dryRun, maxJobsPerTick, outputDir });
  } catch (caught) {
    if (once) {
      throw caught;
    }

    const message = caught instanceof Error ? caught.message : "unknown worker error";
    console.error(`worker tick failed: ${message}`);
  }

  if (once) {
    break;
  }

  await sleep(pollIntervalMs);
} while (true);
