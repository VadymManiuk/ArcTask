import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  keccak256,
  parseUnits,
  stringToHex
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { waitForTransactionReceiptWithRetry } from "./arc-rpc.mjs";

const rootDir = process.cwd();
const defaultEscrowV2Address = "0x6255f3fbb7b4f82062b929029dc005baf0ca3ebb";
const defaultEscrowV3Address = "0x548531bbe48db4cded53da0d30998e7553eee53f";
const defaultEscrowV4Address = "0xb4791ed947067daf445c936ee44cedec949bdbb4";
const defaultRegistryAddress = "0xd8499627775ac67cd756335a3c48387d0aff5553";

function loadLocalEnv() {
  const envPath = path.join(rootDir, ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...parts] = trimmed.split("=");
    if (!process.env[key]) process.env[key] = parts.join("=").replace(/^["']|["']$/g, "");
  }
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function readAbi(fileName) {
  return JSON.parse(fs.readFileSync(path.join(rootDir, "lib/contracts/abis", fileName), "utf8"));
}

loadLocalEnv();

const rpcUrl = process.env.NEXT_PUBLIC_ARC_RPC_URL ?? "https://rpc.testnet.arc.network";
const readRpcUrl = process.env.ARC_AGENT_READ_RPC_URL ?? "https://testnet.arcscan.app/api/eth-rpc";
const useV4 = process.argv.includes("--v4");
const useFundedRetry = useV4 || process.argv.includes("--v3");
const escrowAddress = useV4
  ? process.env.NEXT_PUBLIC_ERC8183_ESCROW_V4_ADDRESS ?? defaultEscrowV4Address
  : useFundedRetry
    ? process.env.NEXT_PUBLIC_ERC8183_ESCROW_V3_ADDRESS ?? defaultEscrowV3Address
    : process.env.NEXT_PUBLIC_ERC8183_ESCROW_V2_ADDRESS ?? defaultEscrowV2Address;
const registryAddress = process.env.NEXT_PUBLIC_ERC8004_REGISTRY_ADDRESS ?? defaultRegistryAddress;
const account = privateKeyToAccount(
  requiredEnv("ARC_TESTNET_DEPLOYER_PRIVATE_KEY").startsWith("0x")
    ? requiredEnv("ARC_TESTNET_DEPLOYER_PRIVATE_KEY")
    : `0x${requiredEnv("ARC_TESTNET_DEPLOYER_PRIVATE_KEY")}`
);
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

async function send(functionName, args = [], value) {
  const hash = await walletClient.writeContract({
    address: escrowAddress,
    abi: escrowAbi,
    functionName,
    args,
    value
  });
  const receipt = await waitForTransactionReceiptWithRetry(publicClient, hash);
  if (receipt.status !== "success") throw new Error(`${functionName} failed: ${hash}`);
  console.log(`${functionName}: ${hash}`);
  return hash;
}

const agentId = BigInt(process.env.NEXT_PUBLIC_ARCTASK_MANAGED_AGENT_ID ?? "1");
const agentOwner = await publicClient.readContract({
  address: registryAddress,
  abi: registryAbi,
  functionName: "getAgentOwner",
  args: [agentId]
});
if (agentOwner.toLowerCase() !== account.address.toLowerCase()) {
  throw new Error(`Smoke signer ${account.address} does not own managed agent ${agentId}.`);
}

const reward = parseUnits("0.001", 18);
const quote = await publicClient.readContract({
  address: escrowAddress,
  abi: escrowAbi,
  functionName: "quoteFunding",
  args: [reward]
});
const nextJobId = await publicClient.readContract({
  address: escrowAddress,
  abi: escrowAbi,
  functionName: "nextJobId"
});
const payload = {
  schema: "arctask.internal-smoke.v2",
  title: "Internal hybrid escrow smoke",
  description: "Smoke-only lifecycle verification; hidden from marketplace feeds."
};
const jobUri = `data:application/json,${encodeURIComponent(JSON.stringify(payload))}`;
await send(
  "createJob",
  [agentId, reward, BigInt(Math.floor(Date.now() / 1000) + 3600), account.address, jobUri],
  quote[0]
);
let expectedAcceptedClaimable = quote[0];
if (useFundedRetry) {
  await send("submitDeliverable", [
    nextJobId,
    keccak256(stringToHex("ArcTask hybrid escrow initial smoke deliverable"))
  ]);
  await send("requestRevision", [nextJobId, "Smoke retry lifecycle verification"]);
  const retryReward = parseUnits("0.001", 18);
  const retryQuote = await publicClient.readContract({
    address: escrowAddress,
    abi: escrowAbi,
    functionName: "quoteFunding",
    args: [retryReward]
  });
  const revisedPayload = {
    ...payload,
    description: "Smoke-only revised lifecycle verification with isolated retry funding."
  };
  await send(
    "fundRetry",
    [
      nextJobId,
      retryReward,
      BigInt(Math.floor(Date.now() / 1000) + 7200),
      `data:application/json,${encodeURIComponent(JSON.stringify(revisedPayload))}`
    ],
    retryQuote[0]
  );
  const execution = await publicClient.readContract({
    address: escrowAddress,
    abi: escrowAbi,
    functionName: "getJobExecution",
    args: [nextJobId]
  });
  if (execution[0] !== 2) throw new Error(`Expected execution version 2, received ${execution[0]}.`);
  if (execution[1] !== retryReward) throw new Error("Retry execution budget was not isolated.");
  expectedAcceptedClaimable += retryQuote[0];
}
const deliverableHash = keccak256(stringToHex("ArcTask hybrid escrow V2 smoke deliverable"));
await send("submitDeliverable", [nextJobId, deliverableHash]);
await send("acceptWork", [nextJobId]);

const job = await publicClient.readContract({
  address: escrowAddress,
  abi: escrowAbi,
  functionName: "jobs",
  args: [nextJobId]
});
if (job[8] !== 2) throw new Error(`Expected accepted status 2, received ${job[8]}.`);

const claimable = await publicClient.readContract({
  address: escrowAddress,
  abi: escrowAbi,
  functionName: "claimable",
  args: [account.address]
});
if (claimable !== expectedAcceptedClaimable) {
  throw new Error(`Expected claimable ${expectedAcceptedClaimable}, received ${claimable}.`);
}
await send("withdraw");

const disputeJobId = await publicClient.readContract({
  address: escrowAddress,
  abi: escrowAbi,
  functionName: "nextJobId"
});
await send(
  "createJob",
  [agentId, reward, BigInt(Math.floor(Date.now() / 1000) + 3600), account.address, jobUri],
  quote[0]
);
await send("submitDeliverable", [
  disputeJobId,
  keccak256(stringToHex("ArcTask hybrid escrow V2 disputed smoke deliverable"))
]);
await send("openDispute", [disputeJobId, keccak256(stringToHex("Smoke dispute reason"))]);
await send("resolveDispute", [
  disputeJobId,
  0,
  keccak256(stringToHex("Smoke arbitration awarded the remaining reward to the client"))
]);
const disputeJob = await publicClient.readContract({
  address: escrowAddress,
  abi: escrowAbi,
  functionName: "jobs",
  args: [disputeJobId]
});
if (disputeJob[8] !== 3) throw new Error(`Expected rejected status 3, received ${disputeJob[8]}.`);
const disputedClaimable = await publicClient.readContract({
  address: escrowAddress,
  abi: escrowAbi,
  functionName: "claimable",
  args: [account.address]
});
if (disputedClaimable !== quote[0]) {
  throw new Error(`Expected disputed claimable ${quote[0]}, received ${disputedClaimable}.`);
}
await send("withdraw");

console.log(`Hybrid escrow smoke passed for accepted job ${nextJobId} and disputed job ${disputeJobId}.`);
