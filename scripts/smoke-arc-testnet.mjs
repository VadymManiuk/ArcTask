import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  keccak256,
  stringToHex
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

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
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Error(`${label} failed: ${hash}`);
  }

  console.log(`${label}: ${hash}`);
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
    decimals: 6
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

const agentId = await publicClient.readContract({
  address: registryAddress,
  abi: registryAbi,
  functionName: "nextAgentId"
});
const jobId = await publicClient.readContract({
  address: escrowAddress,
  abi: escrowAbi,
  functionName: "nextJobId"
});
const metadataUri = `https://arc-task-kappa.vercel.app/metadata/testnet-agent-${agentId}.json`;
const rewardAmount = 1_000_000n;
const deadline = BigInt(Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60);
const deliverableHash = keccak256(stringToHex(`ArcTask testnet smoke deliverable ${Date.now()}`));

console.log(`Account: ${account.address}`);
console.log(`Registry: ${registryAddress}`);
console.log(`Escrow: ${escrowAddress}`);
console.log(`Agent ID: ${agentId}`);
console.log(`Job ID: ${jobId}`);

await waitForSuccess(
  publicClient,
  await walletClient.writeContract({
    address: registryAddress,
    abi: registryAbi,
    functionName: "registerAgent",
    args: [account.address, metadataUri]
  }),
  "registerAgent"
);

await waitForSuccess(
  publicClient,
  await walletClient.writeContract({
    address: escrowAddress,
    abi: escrowAbi,
    functionName: "createJob",
    args: [agentId, rewardAmount, deadline, account.address],
    value: rewardAmount
  }),
  "createJob"
);

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

console.log(`Explorer: ${explorerUrl}/address/${escrowAddress}`);
