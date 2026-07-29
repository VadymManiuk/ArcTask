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
import { waitForTransactionReceiptWithRetry, withRpcRetry } from "./arc-rpc.mjs";

const rootDir = process.cwd();
const seedNamespace = "arctask.live-marketplace.v1";
const execute = process.argv.includes("--execute");

function loadLocalEnv() {
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

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

function normalizePrivateKey(value) {
  return value.startsWith("0x") ? value : `0x${value}`;
}

function readAbi(fileName) {
  return JSON.parse(fs.readFileSync(path.join(rootDir, "lib/contracts/abis", fileName), "utf8"));
}

function encodePayload(payload) {
  return `data:application/json,${encodeURIComponent(JSON.stringify(payload))}`;
}

function decodePayload(uri) {
  if (!uri.startsWith("data:application/json,")) {
    return null;
  }

  try {
    return JSON.parse(decodeURIComponent(uri.slice("data:application/json,".length)));
  } catch {
    return null;
  }
}

async function waitForSuccess(publicClient, hash, label) {
  const receipt = await waitForTransactionReceiptWithRetry(publicClient, hash);
  if (receipt.status !== "success") {
    throw new Error(`${label} failed: ${hash}`);
  }
  return receipt;
}

function pauseBetweenTransactions() {
  return new Promise((resolve) => setTimeout(resolve, 3_000));
}

const agentDefinitions = [
  {
    key: "arc-research",
    name: "Arc Research Agent",
    description: "Researches Arc ecosystem projects, market structure, stablecoin infrastructure, and public sources.",
    capabilities: ["ecosystem research", "market analysis", "source verification"],
    jobs: [
      {
        key: "ecosystem-opportunities",
        title: "Map Arc ecosystem opportunities",
        description:
          "Identify active Arc ecosystem projects, explain their use cases, verify primary sources, and deliver a concise opportunity and risk map."
      },
      {
        key: "stablecoin-infrastructure",
        title: "Compare stablecoin infrastructure on Arc",
        description:
          "Compare the main stablecoin infrastructure patterns relevant to Arc, including settlement, liquidity, integrations, and operational risks."
      }
    ]
  },
  {
    key: "contract-auditor",
    name: "Smart Contract Auditor",
    description: "Reviews Solidity contracts for authorization errors, broken invariants, unsafe transfers, and settlement risks.",
    capabilities: ["Solidity review", "security analysis", "invariant testing"],
    jobs: [
      {
        key: "escrow-invariants",
        title: "Review escrow contract invariants",
        description:
          "Review the ArcTask escrow lifecycle and document authorization, settlement, refund, and reentrancy invariants with concrete findings."
      },
      {
        key: "registry-access",
        title: "Analyze registry access controls",
        description:
          "Analyze agent registry administration, escrow authorization, metadata ownership, and reputation update boundaries."
      }
    ]
  },
  {
    key: "data-analyst",
    name: "Data Analysis Agent",
    description: "Transforms marketplace and protocol data into clean datasets, metrics, and decision-ready reports.",
    capabilities: ["data analysis", "schema normalization", "reporting"],
    jobs: [
      {
        key: "performance-report",
        title: "Build agent performance report",
        description:
          "Define and calculate useful agent marketplace metrics for completion rate, rejection rate, earnings, and reputation quality."
      },
      {
        key: "activity-normalization",
        title: "Normalize marketplace activity data",
        description:
          "Create a canonical schema for agent registrations, funded jobs, submissions, settlements, and refunds."
      }
    ]
  },
  {
    key: "product-qa",
    name: "Product QA Agent",
    description: "Validates user flows, acceptance criteria, responsive behavior, and failure states across the ArcTask product.",
    capabilities: ["product QA", "regression testing", "UX validation"],
    jobs: [
      {
        key: "settlement-flow",
        title: "Test job creation and settlement flow",
        description:
          "Validate the complete client, agent, and evaluator flow from job creation through deliverable review and settlement."
      },
      {
        key: "mobile-marketplace",
        title: "Validate mobile marketplace UX",
        description:
          "Review the agents, jobs, dashboard, and docs routes on small screens and report usability or layout issues."
      }
    ]
  },
  {
    key: "technical-writer",
    name: "Technical Writer Agent",
    description: "Produces clear protocol documentation, API references, operational runbooks, and release notes.",
    capabilities: ["technical writing", "API documentation", "runbooks"],
    jobs: [
      {
        key: "integration-guide",
        title: "Write ArcTask integration guide",
        description:
          "Write a concise integration guide covering Arc Testnet configuration, contracts, agent discovery, jobs, and deliverable verification."
      },
      {
        key: "evaluator-runbook",
        title: "Create evaluator operations runbook",
        description:
          "Document how an evaluator verifies a private deliverable, accepts or rejects work, handles deadlines, and confirms onchain settlement."
      }
    ]
  },
  {
    key: "treasury-payments",
    name: "Treasury Payments Agent",
    description:
      "Reviews invoices, payment requests, recipient wallets, approvals, delivery evidence, and settlement readiness.",
    capabilities: ["payment review", "invoice validation", "treasury operations"],
    jobs: []
  },
  {
    key: "counterparty-risk",
    name: "Counterparty Risk Agent",
    description:
      "Assesses wallet and counterparty evidence, ownership signals, operational exposure, and transaction risk.",
    capabilities: ["wallet risk", "counterparty review", "evidence verification"],
    jobs: []
  },
  {
    key: "protocol-integration",
    name: "Protocol Integration Engineer",
    description:
      "Designs and reviews API, wallet, contract, indexer, and cross-chain integration plans with implementation guidance.",
    capabilities: ["API integration", "wallet integration", "implementation planning"],
    jobs: []
  },
  {
    key: "devops-reliability",
    name: "DevOps Reliability Agent",
    description:
      "Reviews deployments, monitoring, incident response, RPC reliability, runbooks, and production readiness.",
    capabilities: ["deployment review", "observability", "incident response"],
    jobs: []
  },
  {
    key: "governance-compliance",
    name: "Governance & Compliance Agent",
    description:
      "Reviews governance processes, role separation, policy controls, audit evidence, and operational compliance gaps.",
    capabilities: ["governance review", "policy analysis", "control assessment"],
    jobs: []
  }
];

loadLocalEnv();

const rpcUrl = process.env.NEXT_PUBLIC_ARC_RPC_URL ?? "https://rpc.testnet.arc.network";
const explorerUrl = process.env.NEXT_PUBLIC_ARC_EXPLORER_URL ?? "https://testnet.arcscan.app";
const registryAddress = requiredEnv("NEXT_PUBLIC_ERC8004_REGISTRY_ADDRESS");
const escrowAddress = requiredEnv("NEXT_PUBLIC_ERC8183_ESCROW_ADDRESS");
const account = privateKeyToAccount(normalizePrivateKey(requiredEnv("ARC_TESTNET_DEPLOYER_PRIVATE_KEY")));
const registryAbi = readAbi("ERC8004AgentRegistry.json");
const escrowAbi = readAbi("ERC8183Escrow.json");
const rewardAmount = parseUnits("0.05", 18);
const deadline = BigInt(Math.floor(Date.now() / 1_000) + 30 * 24 * 60 * 60);

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
const publicClient = createPublicClient({ chain: arcTestnet, transport: http(rpcUrl) });
const walletClient = createWalletClient({ account, chain: arcTestnet, transport: http(rpcUrl) });

const retryOptions = { maxAttempts: 10, baseDelayMs: 3_000 };
const nextAgentId = await withRpcRetry(
  () =>
    publicClient.readContract({
      address: registryAddress,
      abi: registryAbi,
      functionName: "nextAgentId"
    }),
  retryOptions
);
const existingAgents = new Map();
for (let agentId = 1n; agentId < nextAgentId; agentId += 1n) {
  const agent = await withRpcRetry(
    () =>
      publicClient.readContract({
        address: registryAddress,
        abi: registryAbi,
        functionName: "agents",
        args: [agentId]
      }),
    retryOptions
  );
  const payload = decodePayload(agent[1]);
  if (payload?.seedNamespace === seedNamespace && typeof payload.seedKey === "string") {
    existingAgents.set(payload.seedKey, agentId);
  }
}

const nextJobId = await withRpcRetry(
  () =>
    publicClient.readContract({
      address: escrowAddress,
      abi: escrowAbi,
      functionName: "nextJobId"
    }),
  retryOptions
);
const existingJobs = new Map();
for (let jobId = 1n; jobId < nextJobId; jobId += 1n) {
  const job = await withRpcRetry(
    () =>
      publicClient.readContract({
        address: escrowAddress,
        abi: escrowAbi,
        functionName: "jobs",
        args: [jobId]
      }),
    retryOptions
  );
  const payload = decodePayload(job[6]);
  if (payload?.seedNamespace === seedNamespace && typeof payload.seedKey === "string") {
    existingJobs.set(payload.seedKey, jobId);
  }
}

const missingAgentCount = agentDefinitions.filter((agent) => !existingAgents.has(agent.key)).length;
const missingJobCount = agentDefinitions
  .flatMap((agent) => agent.jobs)
  .filter((job) => !existingJobs.has(job.key)).length;
const balance = await withRpcRetry(() => publicClient.getBalance({ address: account.address }), retryOptions);
const requiredJobValue = rewardAmount * BigInt(missingJobCount);

console.log(`Mode: ${execute ? "execute" : "inspect"}`);
console.log(`Wallet: ${account.address}`);
console.log(`Balance: ${formatUnits(balance, 18)} USDC`);
console.log(`Missing agents: ${missingAgentCount}`);
console.log(`Missing jobs: ${missingJobCount}`);
console.log(`Job funding required: ${formatUnits(requiredJobValue, 18)} USDC`);

if (!execute) {
  console.log("Run with --execute to submit the missing transactions.");
  process.exit(0);
}

if (balance <= requiredJobValue) {
  throw new Error("Wallet balance is not sufficient for job funding and gas.");
}

const agentIds = new Map(existingAgents);
const agentTransactions = [];
const jobTransactions = [];

for (const definition of agentDefinitions) {
  let agentId = agentIds.get(definition.key);
  if (!agentId) {
    const metadataUri = encodePayload({
      schema: "arctask.agent.v1",
      seedNamespace,
      seedKey: definition.key,
      name: definition.name,
      description: definition.description,
      capabilities: definition.capabilities,
      ownerWallet: account.address
    });
    const hash = await withRpcRetry(
      () =>
        walletClient.writeContract({
          address: registryAddress,
          abi: registryAbi,
          functionName: "registerAgent",
          args: [account.address, metadataUri]
        }),
      { maxAttempts: 8, baseDelayMs: 4_000 }
    );
    const receipt = await waitForSuccess(publicClient, hash, `Register ${definition.name}`);
    const event = parseEventLogs({
      abi: registryAbi,
      logs: receipt.logs,
      eventName: "AgentRegistered",
      strict: true
    }).find((item) => item.address.toLowerCase() === registryAddress.toLowerCase());
    agentId = event?.args?.agentId;
    if (typeof agentId !== "bigint") {
      throw new Error(`AgentRegistered event missing for ${definition.name}.`);
    }
    agentIds.set(definition.key, agentId);
    agentTransactions.push({ name: definition.name, id: agentId.toString(), hash });
    console.log(`Registered ${definition.name}: agent ${agentId.toString()}`);
    await pauseBetweenTransactions();
  } else {
    console.log(`Reusing ${definition.name}: agent ${agentId.toString()}`);
  }

  for (const jobDefinition of definition.jobs) {
    const existingJobId = existingJobs.get(jobDefinition.key);
    if (existingJobId) {
      console.log(`Reusing ${jobDefinition.title}: job ${existingJobId.toString()}`);
      continue;
    }

    const jobUri = encodePayload({
      schema: "arctask.job.v1",
      seedNamespace,
      seedKey: jobDefinition.key,
      title: jobDefinition.title,
      description: jobDefinition.description,
      onchainAgentId: agentId.toString(),
      clientWallet: account.address,
      evaluatorWallet: account.address,
      rewardAmount: Number(formatUnits(rewardAmount, 18)),
      createdAt: new Date().toISOString()
    });
    const hash = await withRpcRetry(
      () =>
        walletClient.writeContract({
          address: escrowAddress,
          abi: escrowAbi,
          functionName: "createJob",
          args: [agentId, rewardAmount, deadline, account.address, jobUri],
          value: rewardAmount
        }),
      { maxAttempts: 8, baseDelayMs: 4_000 }
    );
    const receipt = await waitForSuccess(publicClient, hash, `Create ${jobDefinition.title}`);
    const event = parseEventLogs({
      abi: escrowAbi,
      logs: receipt.logs,
      eventName: "JobCreated",
      strict: true
    }).find((item) => item.address.toLowerCase() === escrowAddress.toLowerCase());
    const jobId = event?.args?.jobId;
    if (typeof jobId !== "bigint") {
      throw new Error(`JobCreated event missing for ${jobDefinition.title}.`);
    }
    existingJobs.set(jobDefinition.key, jobId);
    jobTransactions.push({ title: jobDefinition.title, id: jobId.toString(), hash });
    console.log(`Created ${jobDefinition.title}: job ${jobId.toString()}`);
    await pauseBetweenTransactions();
  }
}

console.log(`Created agents: ${agentTransactions.length}`);
console.log(`Created jobs: ${jobTransactions.length}`);
for (const transaction of [...agentTransactions, ...jobTransactions]) {
  console.log(`${"name" in transaction ? transaction.name : transaction.title}: ${explorerUrl}/tx/${transaction.hash}`);
}
