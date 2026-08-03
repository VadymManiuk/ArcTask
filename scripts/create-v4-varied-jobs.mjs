import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  fallback,
  formatUnits,
  http,
  parseEventLogs,
  parseUnits
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createExecutionPlan } from "../lib/execution-routing.mjs";
import { waitForTransactionReceiptWithRetry, withRpcRetry } from "./arc-rpc.mjs";

const rootDir = process.cwd();
const execute = process.argv.includes("--execute");
const retryStandardTargetVersion = process.argv.includes("--retry-standard-v3") ? 3 : 2;
const retryStandard =
  process.argv.includes("--retry-standard") ||
  process.argv.includes("--retry-standard-v3");
const batchId = "arctask.v4.varied-jobs.2026-08-03";
const defaultEscrowAddress = "0xb4791ed947067daf445c936ee44cedec949bdbb4";
const defaultRegistryAddress = "0xd8499627775ac67cd756335a3c48387d0aff5553";
const defaultRpcUrl = "https://rpc.testnet.arc.network";
const defaultReadRpcUrl = "https://testnet.arcscan.app/api/eth-rpc";
const firstV4JobId = BigInt(process.env.NEXT_PUBLIC_ESCROW_V4_INITIAL_JOB_ID ?? "3000000");

const jobDefinitions = [
  {
    batchKey: "standard:agent-profile-checklist:8",
    expectedTier: "standard",
    agentId: 8n,
    agentName: "Technical Writer Agent",
    reward: "0.1",
    title: "Write an agent profile setup checklist",
    description:
      "Prepare a concise help article for creating an ArcTask agent profile. Explain how to choose a clear name, specialty, description, capabilities, and image; what the generated identity mark means when no image is uploaded; and how to confirm the published profile is readable. Use the headings Before you start, Setup, Final check, and Recommendations. Keep it under 600 words.",
    acceptanceCriteria: [
      "Uses all four requested headings",
      "Covers both uploaded images and generated identity marks",
      "Gives directly actionable setup and verification steps",
      "Stays under 600 words"
    ]
  },
  {
    batchKey: "pro:profile-withdrawal-qa:7",
    expectedTier: "pro",
    agentId: 7n,
    agentName: "Product QA Agent",
    reward: "0.5",
    title: "Analyze profile withdrawal UI scenarios",
    description:
      "Create a focused frontend QA plan for the ArcTask profile withdrawal screen with browser test cases. Cover disconnected and switched accounts, empty credits, V2/V3/V4 rows, loading and stale states, duplicate clicks, cancelled confirmation, failed receipt, successful completion, and refreshed totals. For each case provide Preconditions, Steps, Expected result, Failure signal, Severity, and Automation candidate. End with release blockers and a short ship or no-ship decision.",
    acceptanceCriteria: [
      "Covers every requested account, contract, and transaction state",
      "Uses the six requested fields for every test case",
      "Separates release blockers from non-blocking defects",
      "Ends with an evidence-based ship or no-ship decision"
    ]
  },
  {
    batchKey: "expert:resilient-v4-payout:11",
    expectedTier: "expert",
    agentId: 11n,
    agentName: "Protocol Integration Engineer",
    reward: "2",
    title: "Design a resilient V4 payout integration",
    description:
      "Produce a production implementation design for resilient ArcTask V4 payout reads and withdrawals. Analyze trusted RPC fallback and quorum boundaries, multicall versus isolated reads, connected-wallet role checks, claimable-credit freshness, preflight simulation, send and receipt lifecycle, duplicate-submission and idempotency controls, chain switching, stale caches, provider disagreement, rate limits, observability, alerting, rollback, and security assumptions. Include architecture, state machine, failure matrix, TypeScript-oriented interfaces, test strategy, phased rollout, and measurable acceptance gates. Distinguish what can safely use a public fallback from what must stay on the wallet provider.",
    acceptanceCriteria: [
      "Defines read, simulation, submission, receipt, and refresh states",
      "Explains trust boundaries for public RPC and wallet-provider operations",
      "Includes failure handling, idempotency, observability, tests, and rollback",
      "Provides implementable interfaces and measurable rollout gates"
    ]
  }
];

function loadLocalEnv() {
  const envPath = path.join(rootDir, ".env.local");
  if (!fs.existsSync(envPath)) return;

  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...parts] = trimmed.split("=");
    if (!process.env[key]) {
      process.env[key] = parts.join("=").replace(/^["']|["']$/g, "");
    }
  }
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function normalizePrivateKey(value) {
  return value.startsWith("0x") ? value : `0x${value}`;
}

function readAbi(fileName) {
  return JSON.parse(
    fs.readFileSync(path.join(rootDir, "lib", "contracts", "abis", fileName), "utf8")
  );
}

function encodePayload(payload) {
  return `data:application/json,${encodeURIComponent(JSON.stringify(payload))}`;
}

function decodePayload(uri) {
  if (!uri.startsWith("data:application/json,")) return null;
  try {
    return JSON.parse(decodeURIComponent(uri.slice("data:application/json,".length)));
  } catch {
    return null;
  }
}

function sameAddress(left, right) {
  return left.toLowerCase() === right.toLowerCase();
}

loadLocalEnv();

const rpcUrl = process.env.NEXT_PUBLIC_ARC_RPC_URL ?? defaultRpcUrl;
const readRpcUrl = process.env.ARC_AGENT_READ_RPC_URL ?? defaultReadRpcUrl;
const escrowAddress =
  process.env.NEXT_PUBLIC_ERC8183_ESCROW_V4_ADDRESS ?? defaultEscrowAddress;
const registryAddress =
  process.env.NEXT_PUBLIC_ERC8004_REGISTRY_ADDRESS ?? defaultRegistryAddress;
const privateKey = normalizePrivateKey(
  process.env.ARC_TESTNET_DEPLOYER_PRIVATE_KEY ?? requiredEnv("ARC_AGENT_PRIVATE_KEY")
);
const account = privateKeyToAccount(privateKey);
const chain = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "testnet USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } },
  testnet: true
});
const publicClient = createPublicClient({
  chain,
  transport: fallback([http(readRpcUrl), http(rpcUrl)])
});
const walletClient = createWalletClient({ account, chain, transport: http(rpcUrl) });
const escrowAbi = readAbi("ERC8183EscrowV2.json");
const registryAbi = readAbi("ERC8004AgentRegistry.json");
const deadline = BigInt(Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60);

const plans = jobDefinitions.map((job) => ({
  job,
  plan: createExecutionPlan({
    title: job.title,
    description: job.description,
    rewardAmount: Number(job.reward)
  })
}));

for (const { job, plan } of plans) {
  if (plan.budgetDecision !== "sufficient") {
    throw new Error(
      `${job.title} is underfunded: ${job.reward} USDC does not cover ${plan.requiredTier}.`
    );
  }
  if (plan.selectedTier !== job.expectedTier) {
    throw new Error(
      `${job.title} routed to ${plan.selectedTier}; expected ${job.expectedTier}.`
    );
  }

  const agent = await withRpcRetry(() =>
    publicClient.readContract({
      address: registryAddress,
      abi: registryAbi,
      functionName: "agents",
      args: [job.agentId]
    })
  );
  if (!agent[3]) {
    throw new Error(`${job.agentName} (${job.agentId}) is not active.`);
  }
  if (!sameAddress(agent[0], account.address)) {
    throw new Error(
      `${job.agentName} (${job.agentId}) is owned by ${agent[0]}, not ${account.address}.`
    );
  }
}

const nextJobId = await withRpcRetry(() =>
  publicClient.readContract({
    address: escrowAddress,
    abi: escrowAbi,
    functionName: "nextJobId"
  })
);
const existingKeys = new Set();
const existingJobs = new Map();
for (let jobId = firstV4JobId; jobId < nextJobId; jobId += 1n) {
  const job = await withRpcRetry(() =>
    publicClient.readContract({
      address: escrowAddress,
      abi: escrowAbi,
      functionName: "jobs",
      args: [jobId]
    })
  );
  const payload = decodePayload(job[6]);
  if (payload?.batchId === batchId && typeof payload.batchKey === "string") {
    existingKeys.add(payload.batchKey);
    existingJobs.set(payload.batchKey, { jobId, job, payload });
  }
}

const missing = plans.filter(({ job }) => !existingKeys.has(job.batchKey));
const quotes = [];
let requiredFunding = 0n;
for (const { job } of missing) {
  const reward = parseUnits(job.reward, 18);
  const quote = await withRpcRetry(() =>
    publicClient.readContract({
      address: escrowAddress,
      abi: escrowAbi,
      functionName: "quoteFunding",
      args: [reward]
    })
  );
  quotes.push({ reward, totalFunding: quote[0] });
  requiredFunding += quote[0];
}

const balance = await withRpcRetry(() => publicClient.getBalance({ address: account.address }));

console.log(`V4 escrow: ${escrowAddress}`);
console.log(`Client/evaluator: ${account.address}`);
console.log(`Existing jobs in this batch: ${existingKeys.size}`);
console.log(`Jobs to create: ${missing.length}`);
console.log(`Required funding: ${formatUnits(requiredFunding, 18)} testnet USDC`);
console.log(`Wallet balance: ${formatUnits(balance, 18)} testnet USDC`);
for (const { job, plan } of plans) {
  console.log(
    `${job.expectedTier.padEnd(8)} ${job.reward.padStart(4)} USDC · agent ${job.agentId} ${job.agentName} · score ${plan.complexity.score} · ${plan.model}`
  );
}

if (retryStandard) {
  if (!execute) {
    throw new Error("--retry-standard requires --execute.");
  }
  const definition = jobDefinitions.find((job) => job.expectedTier === "standard");
  const existing = definition ? existingJobs.get(definition.batchKey) : undefined;
  if (!definition || !existing) {
    throw new Error("The Standard V4 job does not exist.");
  }
  const execution = await withRpcRetry(() =>
    publicClient.readContract({
      address: escrowAddress,
      abi: escrowAbi,
      functionName: "getJobExecution",
      args: [existing.jobId]
    })
  );
  if (Number(execution[0]) >= retryStandardTargetVersion) {
    console.log(`Standard V4 job #${existing.jobId} already uses execution version ${execution[0]}.`);
    process.exit(0);
  }
  if (Number(execution[0]) !== retryStandardTargetVersion - 1) {
    throw new Error(
      `Standard V4 job #${existing.jobId} must be on execution version ${retryStandardTargetVersion - 1} before funding v${retryStandardTargetVersion}.`
    );
  }
  if (Number(existing.job[8]) !== 0) {
    throw new Error(`Standard V4 job #${existing.jobId} is not FUNDED.`);
  }

  const rewardIncrease = parseUnits(definition.reward, 18);
  const quote = await withRpcRetry(() =>
    publicClient.readContract({
      address: escrowAddress,
      abi: escrowAbi,
      functionName: "quoteFunding",
      args: [rewardIncrease]
    })
  );
  if (balance < quote[0]) {
    throw new Error("Insufficient testnet USDC balance for the Standard controlled retry.");
  }
  const revisedDescription = [
    definition.description,
    "Keep the four requested headings and include these exact labeled lines inside them: Prerequisites:, Assumptions:, Step 1:, Verification:, Failure handling:, and Next steps:.",
    "Do not replace those six labels with synonyms."
  ].join(" ");
  const revisedPlan = createExecutionPlan({
    title: definition.title,
    description: revisedDescription,
    rewardAmount: Number(definition.reward)
  });
  const revisedPayload = {
    ...existing.payload,
    title: definition.title,
    description: revisedDescription,
    rewardAmount: Number(formatUnits(existing.job[4] + rewardIncrease, 18)),
    deadline: new Date(Number(deadline) * 1000).toISOString(),
    difficulty: definition.expectedTier,
    acceptanceCriteria: definition.acceptanceCriteria,
    executionEstimate: revisedPlan,
    revisedAt: new Date().toISOString(),
    revisionReason:
      `Controlled retry v${retryStandardTargetVersion} after the previous draft used reader-friendly wording that the legacy quality gate interpreted too literally.`
  };
  const hash = await walletClient.writeContract({
    address: escrowAddress,
    abi: escrowAbi,
    functionName: "fundRetry",
    args: [
      existing.jobId,
      rewardIncrease,
      deadline,
      encodePayload(revisedPayload)
    ],
    value: quote[0]
  });
  const receipt = await waitForTransactionReceiptWithRetry(publicClient, hash);
  if (receipt.status !== "success") {
    throw new Error(`fundRetry failed for Standard V4 job #${existing.jobId}: ${hash}`);
  }
  console.log(
    `Funded Standard V4 retry #${existing.jobId} v${retryStandardTargetVersion} with ${definition.reward} USDC (${formatUnits(quote[0], 18)} total): ${hash}`
  );
  process.exit(0);
}

if (!execute) {
  console.log("Dry run only. Re-run with --execute to create missing jobs.");
  process.exit(0);
}
if (balance < requiredFunding) {
  throw new Error("Insufficient testnet USDC balance for the V4 job batch.");
}

const created = [];
for (let index = 0; index < missing.length; index += 1) {
  const { job, plan } = missing[index];
  const quote = quotes[index];
  const payload = {
    schema: "arctask.job.v1",
    batchId,
    batchKey: job.batchKey,
    title: job.title,
    description: job.description,
    localAgentId: `agent-onchain-${job.agentId}`,
    onchainAgentId: job.agentId.toString(),
    clientWallet: account.address,
    evaluatorWallet: account.address,
    rewardAmount: Number(job.reward),
    deadline: new Date(Number(deadline) * 1000).toISOString(),
    difficulty: job.expectedTier,
    acceptanceCriteria: job.acceptanceCriteria,
    executionEstimate: plan,
    createdAt: new Date().toISOString()
  };

  const hash = await walletClient.writeContract({
    address: escrowAddress,
    abi: escrowAbi,
    functionName: "createJob",
    args: [
      job.agentId,
      quote.reward,
      deadline,
      account.address,
      encodePayload(payload)
    ],
    value: quote.totalFunding
  });
  const receipt = await waitForTransactionReceiptWithRetry(publicClient, hash);
  if (receipt.status !== "success") {
    throw new Error(`createJob failed for ${job.title}: ${hash}`);
  }
  const event = parseEventLogs({
    abi: escrowAbi,
    logs: receipt.logs,
    eventName: "JobCreated",
    strict: true
  }).find((candidate) => sameAddress(candidate.address, escrowAddress));
  if (typeof event?.args?.jobId !== "bigint") {
    throw new Error(`JobCreated event missing for ${job.title}: ${hash}`);
  }

  created.push({
    jobId: event.args.jobId.toString(),
    tier: job.expectedTier,
    title: job.title,
    agentId: job.agentId.toString(),
    reward: job.reward,
    txHash: hash
  });
  console.log(
    `Created #${event.args.jobId} · ${job.expectedTier} · ${job.agentName} · ${hash}`
  );
}

console.log(JSON.stringify({ batchId, created }, null, 2));
