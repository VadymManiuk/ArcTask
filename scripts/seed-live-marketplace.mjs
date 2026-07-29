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
      },
      {
        key: "arc-rpc-resilience",
        title: "Assess Arc RPC provider resilience",
        description:
          "Research Arc Testnet RPC reliability patterns, verify primary sources, compare provider and fallback options, and deliver an evidence-backed opportunity and operational risk map.",
        reward: "2"
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
      },
      {
        key: "escrow-upgrade-threat-model",
        title: "Threat-model the escrow upgrade path",
        description:
          "Perform a critical Solidity security review of the ArcTask escrow and registry sources, model authorization, settlement, refund, reentrancy, and upgrade risks, and provide concrete findings and invariant tests.",
        reward: "10"
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
      },
      {
        key: "settlement-anomaly-dashboard",
        title: "Design a settlement anomaly dashboard",
        description:
          "Define an implementation-ready dataset and metric plan for detecting delayed submissions, status regressions, unusual rejection rates, and settlement anomalies across ArcTask jobs.",
        reward: "0.5"
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
      },
      {
        key: "evaluator-failure-states",
        title: "Design evaluator failure-state tests",
        description:
          "Create an implementation-ready product QA test plan for stale statuses, unavailable deliverables, wrong wallets, rejected transactions, deadline expiry, duplicate clicks, refresh behavior, and responsive evaluator UI, with expected results and severity.",
        reward: "0.5"
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
      },
      {
        key: "job-creation-quickstart",
        title: "Write a job creation quickstart",
        description:
          "Write concise ready-to-use steps covering wallet connection, agent selection, task and acceptance criteria, reward, evaluator, deadline, transaction confirmation, and job tracking.",
        reward: "0.01"
      }
    ]
  },
  {
    key: "treasury-payments",
    name: "Treasury Payments Agent",
    description:
      "Reviews invoices, payment requests, recipient wallets, approvals, delivery evidence, and settlement readiness.",
    capabilities: ["payment review", "invoice validation", "treasury operations"],
    jobs: [
      {
        key: "milestone-payment-review",
        title: "Review a milestone payment request",
        description:
          "Review invoice ARCT-2026-07 from ArcTask Studio for a 750 USDC frontend milestone payable to 0x7B42ED8165710a86684a54E8B02ec0f61Da8C897. Check invoice completeness, recipient ownership evidence, delivery proof, approvals, settlement risks, and exact conditions for payment.",
        reward: "0.5"
      }
    ]
  },
  {
    key: "counterparty-risk",
    name: "Counterparty Risk Agent",
    description:
      "Assesses wallet and counterparty evidence, ownership signals, operational exposure, and transaction risk.",
    capabilities: ["wallet risk", "counterparty review", "evidence verification"],
    jobs: [
      {
        key: "vendor-wallet-risk",
        title: "Assess a new vendor wallet",
        description:
          "Assess vendor wallet 0x7B42ED8165710a86684a54E8B02ec0f61Da8C897 using the supplied onchain job context. Evaluate ownership and transaction-risk evidence, identify missing verification proof, and provide a severity-ranked onboarding recommendation.",
        reward: "2"
      }
    ]
  },
  {
    key: "protocol-integration",
    name: "Protocol Integration Engineer",
    description:
      "Designs and reviews API, wallet, contract, indexer, and cross-chain integration plans with implementation guidance.",
    capabilities: ["API integration", "wallet integration", "implementation planning"],
    jobs: [
      {
        key: "cctp-settlement-integration",
        title: "Design a CCTP settlement integration",
        description:
          "Design an implementation-ready cross-chain CCTP to Arc settlement integration covering APIs, contract boundaries, authentication, idempotency, finality, retries, monitoring, tests, rollout, and operational risks.",
        reward: "2"
      }
    ]
  },
  {
    key: "devops-reliability",
    name: "DevOps Reliability Agent",
    description:
      "Reviews deployments, monitoring, incident response, RPC reliability, runbooks, and production readiness.",
    capabilities: ["deployment review", "observability", "incident response"],
    jobs: [
      {
        key: "rpc-outage-runbook",
        title: "Create an Arc RPC outage response plan",
        description:
          "For an ArcTask stack using Vercel web/API, a PM2 worker on VPS, and the public Arc Testnet RPC, create a concrete outage plan covering detection, provider failover, retry budgets, degraded mode, alerts, rollback, ownership, recovery verification, and readiness gaps.",
        reward: "2"
      }
    ]
  },
  {
    key: "governance-compliance",
    name: "Governance & Compliance Agent",
    description:
      "Reviews governance processes, role separation, policy controls, audit evidence, and operational compliance gaps.",
    capabilities: ["governance review", "policy analysis", "control assessment"],
    jobs: [
      {
        key: "evaluator-role-separation",
        title: "Review evaluator role separation controls",
        description:
          "Review governance and compliance controls for client, evaluator, agent owner, and escrow settlement roles, verify audit evidence requirements, identify conflicts of interest, rank control gaps, and provide remediation steps.",
        reward: "2"
      }
    ]
  }
];

const standaloneJobDefinitions = [
  {
    key: "public-release-readiness",
    title: "Prepare a release readiness brief",
    description:
      "Turn these ArcTask release notes into a structured readiness brief: dynamic GPT-5.6 routing, five new managed agents, no-store network APIs, six-second job status sync, and monotonic status protection. Include scope, assumptions, risks, validation checks, and next steps.",
    reward: "0.1",
    onchainAgentId: process.env.NEXT_PUBLIC_ARCTASK_MANAGED_AGENT_ID ?? "1"
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
const allJobDefinitions = [...agentDefinitions.flatMap((agent) => agent.jobs), ...standaloneJobDefinitions];
const missingJobDefinitions = allJobDefinitions.filter((job) => !existingJobs.has(job.key));
const missingJobCount = missingJobDefinitions.length;
const balance = await withRpcRetry(() => publicClient.getBalance({ address: account.address }), retryOptions);
const requiredJobValue = missingJobDefinitions.reduce(
  (total, job) => total + parseUnits(job.reward ?? "0.05", 18),
  0n
);

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

async function createJobForAgent(agentId, jobDefinition) {
  const existingJobId = existingJobs.get(jobDefinition.key);
  if (existingJobId) {
    console.log(`Reusing ${jobDefinition.title}: job ${existingJobId.toString()}`);
    return;
  }

  const jobRewardAmount = parseUnits(jobDefinition.reward ?? "0.05", 18);
  const jobUri = encodePayload({
    schema: "arctask.job.v1",
    seedNamespace,
    seedKey: jobDefinition.key,
    title: jobDefinition.title,
    description: jobDefinition.description,
    onchainAgentId: agentId.toString(),
    clientWallet: account.address,
    evaluatorWallet: account.address,
    rewardAmount: Number(formatUnits(jobRewardAmount, 18)),
    createdAt: new Date().toISOString()
  });
  const hash = await withRpcRetry(
    () =>
      walletClient.writeContract({
        address: escrowAddress,
        abi: escrowAbi,
        functionName: "createJob",
        args: [agentId, jobRewardAmount, deadline, account.address, jobUri],
        value: jobRewardAmount
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
  jobTransactions.push({
    title: jobDefinition.title,
    id: jobId.toString(),
    reward: formatUnits(jobRewardAmount, 18),
    hash
  });
  console.log(
    `Created ${jobDefinition.title}: job ${jobId.toString()} (${formatUnits(jobRewardAmount, 18)} USDC)`
  );
  await pauseBetweenTransactions();
}

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
    await createJobForAgent(agentId, jobDefinition);
  }
}

for (const jobDefinition of standaloneJobDefinitions) {
  await createJobForAgent(BigInt(jobDefinition.onchainAgentId), jobDefinition);
}

console.log(`Created agents: ${agentTransactions.length}`);
console.log(`Created jobs: ${jobTransactions.length}`);
for (const transaction of [...agentTransactions, ...jobTransactions]) {
  console.log(`${"name" in transaction ? transaction.name : transaction.title}: ${explorerUrl}/tx/${transaction.hash}`);
}
