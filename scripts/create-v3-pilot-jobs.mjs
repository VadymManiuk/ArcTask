import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  formatUnits,
  http,
  parseEventLogs,
  parseUnits
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createExecutionPlan } from "../lib/execution-routing.mjs";
import { waitForTransactionReceiptWithRetry, withRpcRetry } from "./arc-rpc.mjs";

const rootDir = process.cwd();
const pilotBatch = "arctask.v3.five-level-pilot.2026-07-31";
const defaultEscrowV3Address = "0x548531bbe48db4cded53da0d30998e7553eee53f";
const defaultRegistryAddress = "0xd8499627775ac67cd756335a3c48387d0aff5553";
const defaultRpcUrl = "https://rpc.testnet.arc.network";
const defaultReadRpcUrl = "https://testnet.arcscan.app/api/eth-rpc";
const firstV3JobId = BigInt(process.env.NEXT_PUBLIC_ESCROW_V3_INITIAL_JOB_ID ?? "2000000");

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

const pilotJobs = [
  {
    expectedTier: "starter",
    agentId: 1n,
    agentName: "ArcTask Public General Agent",
    reward: "0.01",
    title: "Format a four-step checklist",
    description: "Return exactly four bullets using these headings: Input, Action, Output, Check.",
    acceptanceCriteria: [
      "Exactly four bullets",
      "Uses the requested order",
      "Contains no introduction or conclusion"
    ]
  },
  {
    expectedTier: "standard",
    agentId: 8n,
    agentName: "Technical Writer Agent",
    reward: "0.1",
    title: "Write an ArcTask V3 terminology page",
    description:
      "Using the supplied repository terminology, write a concise documentation page covering job brief, execution version, execution budget, deliverable hash, evaluator, revision reason, deadline, and claimable credit. Give a plain-language definition and one short usage example for every term. Add prerequisites, numbered usage steps, one verification check, one failure note, assumptions, and a next step.",
    acceptanceCriteria: [
      "Defines every requested V3 term",
      "Includes one short example per term",
      "Adds a compact naming checklist",
      "Ready to publish without editing"
    ]
  },
  {
    expectedTier: "pro",
    agentId: 7n,
    agentName: "Product QA Agent",
    reward: "0.5",
    title: "Analyze V3 funded-retry QA scenarios",
    description:
      "Create a frontend QA test plan for a funded job that exhausts its AI budget, displays model and cost telemetry, revises the brief, adds retry funding, starts a new execution version, and preserves the previous usage record. For every test case use the exact fields Basis, Preconditions, Steps, Expected result, Failure signal, Severity, and Release decision. Finish with a prioritized release decision.",
    acceptanceCriteria: [
      "Covers exhausted and underfunded states",
      "Checks wallet, deadline, and positive funding validation",
      "Verifies isolated usage across execution versions",
      "Includes severity and release-blocking criteria"
    ]
  },
  {
    expectedTier: "expert",
    agentId: 12n,
    agentName: "DevOps Reliability Agent",
    reward: "2",
    title: "Review secure V3 worker recovery operations",
    description:
      "Review the supplied ArcTask backend implementation and production deploy recovery path for security, duplicate execution, stale locks, RPC failure, restart safety, rollback, and retry-budget isolation. Use these exact sections: Scope and inputs; Implemented controls; Severity-ranked gaps; Detection; Provider failover; Retry budgets; Degraded mode; Alert thresholds; Rollback; Owner actions; Failure tests; Recovery verification; Production readiness decision. Ground every implemented claim in a supplied file, separate recommendations from implemented behavior, and provide measurable thresholds and operator actions.",
    acceptanceCriteria: [
      "Separates implemented controls from gaps",
      "Covers duplicate execution and persistent usage ledgers",
      "Defines measurable alerts and operator actions",
      "Provides a prioritized remediation sequence"
    ]
  },
  {
    expectedTier: "critical",
    agentId: 5n,
    agentName: "Smart Contract Auditor",
    reward: "10",
    title: "Perform a critical V3 funded-retry escrow audit",
    description:
      "Perform a critical production-readiness security audit of the supplied ArcTaskEscrowV2 Solidity source as deployed for V3. Review createJob, fundRetry, submitDeliverable, requestRevision, acceptWork, finalizeReview, openDispute, resolveDispute, finalizeStaleDispute, refundExpired, withdraw, getJobEconomics, getJobResolution, and getJobExecution. Build an authorization matrix and explicit state machine. Verify cumulative percentage accounting across multiple top-ups, computeFeeCreditedAmount behavior, executionVersion and executionBudgetAmount isolation, deadline extension rules, pull-payment solvency, registry outcome calls, reentrancy boundaries, denial-of-service paths, event correctness, evaluator/client conflicts, and adversarial transaction ordering. Provide severity-ranked confirmed findings, concrete exploit or failure sequences, conservation-of-funds calculations, Foundry-style unit and invariant tests, minimal remediation patches, deployment blockers, accepted residual risks, and a final ship or do-not-ship recommendation. Treat missing evidence as a limitation and distinguish deployed behavior from recommendations.",
    acceptanceCriteria: [
      "References concrete functions and verified source behavior",
      "Proves or disproves accounting conservation across retries",
      "Includes adversarial ordering and authorization analysis",
      "Provides executable test designs and minimal patches",
      "Ends with an explicit production deployment recommendation"
    ]
  }
];

loadLocalEnv();

const execute = process.argv.includes("--execute");
const repairStandard = process.argv.includes("--repair-standard");
const repairPilot = process.argv.includes("--repair-pilot");
const rpcUrl = process.env.NEXT_PUBLIC_ARC_RPC_URL ?? defaultRpcUrl;
const readRpcUrl = process.env.ARC_AGENT_READ_RPC_URL ?? defaultReadRpcUrl;
const escrowAddress =
  process.env.NEXT_PUBLIC_ERC8183_ESCROW_V3_ADDRESS ?? defaultEscrowV3Address;
const registryAddress =
  process.env.NEXT_PUBLIC_ERC8004_REGISTRY_ADDRESS ?? defaultRegistryAddress;
const privateKey = normalizePrivateKey(
  process.env.ARC_TESTNET_DEPLOYER_PRIVATE_KEY ??
    requiredEnv("ARC_AGENT_PRIVATE_KEY")
);
const account = privateKeyToAccount(privateKey);
const chain = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "testnet USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } },
  testnet: true
});
const publicClient = createPublicClient({ chain, transport: http(readRpcUrl) });
const walletClient = createWalletClient({ account, chain, transport: http(rpcUrl) });
const escrowAbi = readAbi("ERC8183EscrowV2.json");
const registryAbi = readAbi("ERC8004AgentRegistry.json");
const deadline = BigInt(Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60);

const plans = pilotJobs.map((job) => ({
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
  const owner = await withRpcRetry(() =>
    publicClient.readContract({
      address: registryAddress,
      abi: registryAbi,
      functionName: "getAgentOwner",
      args: [job.agentId]
    })
  );
  if (!sameAddress(owner, account.address)) {
    throw new Error(
      `${job.agentName} (${job.agentId}) is owned by ${owner}, not worker ${account.address}.`
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
for (let jobId = firstV3JobId; jobId < nextJobId; jobId += 1n) {
  const job = await withRpcRetry(() =>
    publicClient.readContract({
      address: escrowAddress,
      abi: escrowAbi,
      functionName: "jobs",
      args: [jobId]
    })
  );
  const payload = decodePayload(job[6]);
  if (payload?.pilotBatch === pilotBatch && typeof payload?.pilotKey === "string") {
    existingKeys.add(payload.pilotKey);
    existingJobs.set(payload.pilotKey, { jobId, job, payload });
  }
}

const missing = plans.filter(({ job }) => !existingKeys.has(`${job.expectedTier}:${job.agentId}`));
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

console.log(`V3 escrow: ${escrowAddress}`);
console.log(`Client/evaluator/worker: ${account.address}`);
console.log(`Existing pilot jobs: ${existingKeys.size}`);
console.log(`Jobs to create: ${missing.length}`);
console.log(`Required funding: ${formatUnits(requiredFunding, 18)} testnet USDC`);
console.log(`Wallet balance: ${formatUnits(balance, 18)} testnet USDC`);
for (const { job, plan } of plans) {
  console.log(
    `${job.expectedTier.padEnd(8)} ${job.reward.padStart(5)} USDC · agent ${job.agentId} ${job.agentName} · score ${plan.complexity.score}`
  );
}

if (repairStandard) {
  if (!execute) {
    throw new Error("--repair-standard requires --execute.");
  }
  const definition = pilotJobs.find((job) => job.expectedTier === "standard");
  const existing = existingJobs.get(`standard:${definition.agentId}`);
  if (!existing) {
    throw new Error("The standard pilot job does not exist.");
  }
  const execution = await withRpcRetry(() =>
    publicClient.readContract({
      address: escrowAddress,
      abi: escrowAbi,
      functionName: "getJobExecution",
      args: [existing.jobId]
    })
  );
  if (Number(execution[0]) >= 2) {
    console.log(
      `Standard pilot #${existing.jobId} already uses execution version ${execution[0]}; no retry created.`
    );
    process.exit(0);
  }
  if (Number(existing.job[8]) !== 0) {
    throw new Error(`Standard pilot #${existing.jobId} is not FUNDED.`);
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
  const revisedPayload = {
    ...existing.payload,
    title: definition.title,
    description: definition.description,
    rewardAmount: Number(formatUnits(existing.job[4] + rewardIncrease, 18)),
    deadline: new Date(Number(deadline) * 1000).toISOString(),
    acceptanceCriteria: definition.acceptanceCriteria,
    executionEstimate: plans.find(({ job }) => job.expectedTier === "standard").plan,
    revisedAt: new Date().toISOString()
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
    throw new Error(`fundRetry failed for standard pilot #${existing.jobId}: ${hash}`);
  }
  console.log(
    `Funded standard retry #${existing.jobId} v2 with ${definition.reward} USDC: ${hash}`
  );
  process.exit(0);
}

if (repairPilot) {
  if (!execute) {
    throw new Error("--repair-pilot requires --execute.");
  }
  const repairTargets = new Map([
    ["standard", 5],
    ["pro", 2],
    ["expert", 3],
    ["critical", 3]
  ]);
  const revisionReasons = {
    standard:
      "Retry required after the previous execution could not fit the supplied documentation artifacts within its Standard context budget.",
    pro:
      "Retry required after the previous execution selected a tier too small for the supplied frontend QA artifacts.",
    expert:
      "Retry required because the previous deliverable did not satisfy the explicit reliability evidence and recovery sections.",
    critical:
      "Revision required because the previous execution received the legacy escrow source instead of the deployed V3 funded-retry source and ABI."
  };

  for (const [tier, targetVersion] of repairTargets) {
    const definition = pilotJobs.find((job) => job.expectedTier === tier);
    const existing = existingJobs.get(`${tier}:${definition.agentId}`);
    if (!existing) {
      throw new Error(`The ${tier} pilot job does not exist.`);
    }

    let currentJob = await withRpcRetry(() =>
      publicClient.readContract({
        address: escrowAddress,
        abi: escrowAbi,
        functionName: "jobs",
        args: [existing.jobId]
      })
    );
    let execution = await withRpcRetry(() =>
      publicClient.readContract({
        address: escrowAddress,
        abi: escrowAbi,
        functionName: "getJobExecution",
        args: [existing.jobId]
      })
    );
    if (Number(execution[0]) >= targetVersion) {
      console.log(
        `${tier} pilot #${existing.jobId} already uses execution version ${execution[0]}; skipped.`
      );
      continue;
    }

    if (Number(currentJob[8]) === 1) {
      const revisionHash = await walletClient.writeContract({
        address: escrowAddress,
        abi: escrowAbi,
        functionName: "requestRevision",
        args: [existing.jobId, revisionReasons[tier]]
      });
      const revisionReceipt = await waitForTransactionReceiptWithRetry(
        publicClient,
        revisionHash
      );
      if (revisionReceipt.status !== "success") {
        throw new Error(`requestRevision failed for ${tier} pilot: ${revisionHash}`);
      }
      console.log(`Requested revision for ${tier} pilot #${existing.jobId}: ${revisionHash}`);
      currentJob = await withRpcRetry(() =>
        publicClient.readContract({
          address: escrowAddress,
          abi: escrowAbi,
          functionName: "jobs",
          args: [existing.jobId]
        })
      );
    }
    if (Number(currentJob[8]) !== 0) {
      throw new Error(
        `${tier} pilot #${existing.jobId} must be FUNDED before retry; status ${currentJob[8]}.`
      );
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
    const currentBalance = await withRpcRetry(() =>
      publicClient.getBalance({ address: account.address })
    );
    if (currentBalance < quote[0]) {
      throw new Error(`Insufficient balance for the ${tier} pilot retry.`);
    }
    const plan = plans.find(({ job }) => job.expectedTier === tier).plan;
    const revisedPayload = {
      ...decodePayload(currentJob[6]),
      title: definition.title,
      description: definition.description,
      rewardAmount: Number(formatUnits(currentJob[4] + rewardIncrease, 18)),
      deadline: new Date(Number(deadline) * 1000).toISOString(),
      difficulty: tier,
      acceptanceCriteria: definition.acceptanceCriteria,
      executionEstimate: plan,
      revisedAt: new Date().toISOString(),
      revisionReason: revisionReasons[tier]
    };
    const retryHash = await walletClient.writeContract({
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
    const retryReceipt = await waitForTransactionReceiptWithRetry(publicClient, retryHash);
    if (retryReceipt.status !== "success") {
      throw new Error(`fundRetry failed for ${tier} pilot: ${retryHash}`);
    }
    execution = await withRpcRetry(() =>
      publicClient.readContract({
        address: escrowAddress,
        abi: escrowAbi,
        functionName: "getJobExecution",
        args: [existing.jobId]
      })
    );
    console.log(
      `Funded ${tier} retry #${existing.jobId} v${execution[0]} with ${definition.reward} USDC: ${retryHash}`
    );
  }
  process.exit(0);
}

if (!execute) {
  console.log("Dry run only. Re-run with --execute to create missing jobs.");
  process.exit(0);
}
if (balance < requiredFunding) {
  throw new Error("Insufficient testnet USDC balance for the five-job pilot.");
}

const created = [];
for (let index = 0; index < missing.length; index += 1) {
  const { job, plan } = missing[index];
  const quote = quotes[index];
  const payload = {
    schema: "arctask.job.v1",
    pilotBatch,
    pilotKey: `${job.expectedTier}:${job.agentId}`,
    title: job.title,
    description: job.description,
    localAgentId:
      job.agentId === 1n ? "agent-arctask-managed-worker" : `agent-onchain-${job.agentId}`,
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

console.log(JSON.stringify({ pilotBatch, created }, null, 2));
