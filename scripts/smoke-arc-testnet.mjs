import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  keccak256,
  parseEventLogs,
  parseUnits,
  stringToHex
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { waitForTransactionReceiptWithRetry } from "./arc-rpc.mjs";

const rootDir = process.cwd();

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
    throw new Error(`${name} is required. Add it to .env.local.`);
  }

  return value;
}

function normalizePrivateKey(value) {
  return value.startsWith("0x") ? value : `0x${value}`;
}

function readAbi(fileName) {
  return JSON.parse(fs.readFileSync(path.join(rootDir, "lib/contracts/abis", fileName), "utf8"));
}

async function waitForSuccess(publicClient, hash, label) {
  const receipt = await waitForTransactionReceiptWithRetry(publicClient, hash);
  if (receipt.status !== "success") {
    throw new Error(`${label} failed: ${hash}`);
  }

  console.log(`${label}: ${hash}`);
  return receipt;
}

loadLocalEnv();

const rpcUrl = process.env.NEXT_PUBLIC_ARC_RPC_URL ?? "https://rpc.testnet.arc.network";
const explorerUrl = process.env.NEXT_PUBLIC_ARC_EXPLORER_URL ?? "https://testnet.arcscan.app";
const account = privateKeyToAccount(normalizePrivateKey(requiredEnv("ARC_TESTNET_DEPLOYER_PRIVATE_KEY")));
const registryAddress = requiredEnv("NEXT_PUBLIC_ERC8004_REGISTRY_ADDRESS");
const escrowAddress = requiredEnv("NEXT_PUBLIC_ERC8183_ESCROW_ADDRESS");

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

const publicClient = createPublicClient({
  chain: arcTestnet,
  transport: http(rpcUrl)
});
const walletClient = createWalletClient({
  account,
  chain: arcTestnet,
  transport: http(rpcUrl)
});

const registryAbi = readAbi("ERC8004AgentRegistry.json");
const escrowAbi = readAbi("ERC8183Escrow.json");

const escrowAuthorized = await publicClient.readContract({
  address: registryAddress,
  abi: registryAbi,
  functionName: "authorizedEscrows",
  args: [escrowAddress]
});
if (!escrowAuthorized) {
  throw new Error("Escrow is not authorized to record reputation.");
}

let unauthorizedOutcomeRejected = false;
try {
  await publicClient.simulateContract({
    account,
    address: registryAddress,
    abi: registryAbi,
    functionName: "recordOutcome",
    args: [1n, true, 0n]
  });
} catch {
  unauthorizedOutcomeRejected = true;
}
if (!unauthorizedOutcomeRejected) {
  throw new Error("Unauthorized reputation update simulation unexpectedly succeeded.");
}

const metadataUri = `https://arc-task-kappa.vercel.app/metadata/testnet-agent-${Date.now()}.json`;
const rewardAmount = parseUnits("1", arcTestnet.nativeCurrency.decimals);
const deadline = BigInt(Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60);
const deliverableHash = keccak256(stringToHex(`ArcTask testnet smoke deliverable ${Date.now()}`));

console.log(`Account: ${account.address}`);
console.log(`Registry: ${registryAddress}`);
console.log(`Escrow: ${escrowAddress}`);

const registerReceipt = await waitForSuccess(
  publicClient,
  await walletClient.writeContract({
    address: registryAddress,
    abi: registryAbi,
    functionName: "registerAgent",
    args: [account.address, metadataUri]
  }),
  "registerAgent"
);
const registeredEvent = parseEventLogs({
  abi: registryAbi,
  logs: registerReceipt.logs,
  eventName: "AgentRegistered",
  strict: true
}).find((event) => event.address.toLowerCase() === registryAddress.toLowerCase());
const agentId = registeredEvent?.args?.agentId;
if (typeof agentId !== "bigint") {
  throw new Error("AgentRegistered event was not found.");
}

const jobURI = `data:application/json,${encodeURIComponent(JSON.stringify({
  schema: "arctask.job.v1",
  title: "ArcTask smoke job",
  description: "Autonomous testnet smoke task for the ArcTask escrow flow.",
  onchainAgentId: agentId.toString(),
  createdAt: new Date().toISOString()
}))}`;

const createReceipt = await waitForSuccess(
  publicClient,
  await walletClient.writeContract({
    address: escrowAddress,
    abi: escrowAbi,
    functionName: "createJob",
    args: [agentId, rewardAmount, deadline, account.address, jobURI],
    value: rewardAmount
  }),
  "createJob"
);
const createdEvent = parseEventLogs({
  abi: escrowAbi,
  logs: createReceipt.logs,
  eventName: "JobCreated",
  strict: true
}).find((event) => event.address.toLowerCase() === escrowAddress.toLowerCase());
const jobId = createdEvent?.args?.jobId;
if (typeof jobId !== "bigint") {
  throw new Error("JobCreated event was not found.");
}

await waitForSuccess(
  publicClient,
  await walletClient.writeContract({
    address: escrowAddress,
    abi: escrowAbi,
    functionName: "submitDeliverable",
    args: [jobId, deliverableHash]
  }),
  "submitDeliverable"
);

await waitForSuccess(
  publicClient,
  await walletClient.writeContract({
    address: escrowAddress,
    abi: escrowAbi,
    functionName: "acceptWork",
    args: [jobId]
  }),
  "acceptWork"
);

const reputation = await publicClient.readContract({
  address: registryAddress,
  abi: registryAbi,
  functionName: "getAgentReputation",
  args: [agentId]
});
if (
  Number(reputation[0]) !== 58 ||
  reputation[1] !== 1n ||
  reputation[2] !== 0n ||
  reputation[3] !== rewardAmount
) {
  throw new Error(`Unexpected reputation state: ${JSON.stringify(reputation, (_, value) => (
    typeof value === "bigint" ? value.toString() : value
  ))}`);
}

const rejectedJobUri = `data:application/json,${encodeURIComponent(JSON.stringify({
  schema: "arctask.job.v1",
  title: "ArcTask rejected-work smoke job",
  description: "Verifies negative onchain reputation updates and client refunds.",
  onchainAgentId: agentId.toString(),
  createdAt: new Date().toISOString()
}))}`;
const rejectedCreateReceipt = await waitForSuccess(
  publicClient,
  await walletClient.writeContract({
    address: escrowAddress,
    abi: escrowAbi,
    functionName: "createJob",
    args: [agentId, rewardAmount, deadline, account.address, rejectedJobUri],
    value: rewardAmount
  }),
  "createRejectedJob"
);
const rejectedCreatedEvent = parseEventLogs({
  abi: escrowAbi,
  logs: rejectedCreateReceipt.logs,
  eventName: "JobCreated",
  strict: true
}).find((event) => event.address.toLowerCase() === escrowAddress.toLowerCase());
const rejectedJobId = rejectedCreatedEvent?.args?.jobId;
if (typeof rejectedJobId !== "bigint") {
  throw new Error("Rejected-flow JobCreated event was not found.");
}

await waitForSuccess(
  publicClient,
  await walletClient.writeContract({
    address: escrowAddress,
    abi: escrowAbi,
    functionName: "submitDeliverable",
    args: [rejectedJobId, keccak256(stringToHex(`ArcTask rejected smoke deliverable ${Date.now()}`))]
  }),
  "submitRejectedDeliverable"
);
await waitForSuccess(
  publicClient,
  await walletClient.writeContract({
    address: escrowAddress,
    abi: escrowAbi,
    functionName: "rejectWork",
    args: [rejectedJobId]
  }),
  "rejectWork"
);

const reputationAfterRejection = await publicClient.readContract({
  address: registryAddress,
  abi: registryAbi,
  functionName: "getAgentReputation",
  args: [agentId]
});
if (
  Number(reputationAfterRejection[0]) !== 52 ||
  reputationAfterRejection[1] !== 1n ||
  reputationAfterRejection[2] !== 1n ||
  reputationAfterRejection[3] !== rewardAmount
) {
  throw new Error(`Unexpected rejected reputation state: ${JSON.stringify(reputationAfterRejection, (_, value) => (
    typeof value === "bigint" ? value.toString() : value
  ))}`);
}

console.log(`Agent ID: ${agentId}`);
console.log(`Accepted job ID: ${jobId}`);
console.log(`Rejected job ID: ${rejectedJobId}`);
console.log("Reputation: 52 (1 accepted, 1 rejected)");
console.log("Unauthorized reputation update: rejected");
console.log(`Explorer: ${explorerUrl}/address/${escrowAddress}`);
