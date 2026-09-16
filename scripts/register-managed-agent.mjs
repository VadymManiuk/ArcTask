import { ARC_MAINNET, getArcChain, assertArcContracts } from "../lib/arc-network.mjs";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createPublicClient, createWalletClient, encodeFunctionData, http, keccak256, parseEventLogs } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { waitForTransactionReceiptWithRetry } from "./arc-rpc.mjs";

const rootDir = process.cwd();

function loadLocalEnv() {
  const envPath = path.resolve(rootDir, process.env.ARCTASK_ENV_FILE || ".env.local");
  if (!fs.existsSync(envPath)) {
    return;
  }

  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }

    const [key, ...parts] = trimmed.split("=");
    if (process.env[key] === undefined) {
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

function getWorkerPrivateKey() {
  const firstManagedKey = process.env.ARC_AGENT_PRIVATE_KEYS?.split(",").map((value) => value.trim()).find(Boolean);
  const allowDeployerFallback = ["1", "true", "yes", "on"].includes(
    (process.env.ARC_AGENT_ALLOW_DEPLOYER_FALLBACK ?? "").toLowerCase()
  );
  const selectedKey =
    process.env.ARC_AGENT_PRIVATE_KEY ??
    firstManagedKey ??
    (allowDeployerFallback ? process.env.ARC_MAINNET_DEPLOYER_PRIVATE_KEY : undefined);
  return normalizePrivateKey(selectedKey ?? requiredEnv("ARC_AGENT_PRIVATE_KEY"));
}

loadLocalEnv();

const rpcUrl = process.env.NEXT_PUBLIC_ARC_RPC_URL ?? ARC_MAINNET.rpcUrl;
const explorerUrl = process.env.NEXT_PUBLIC_ARC_EXPLORER_URL ?? ARC_MAINNET.explorerUrl;
const registryAddress = requiredEnv("NEXT_PUBLIC_ERC8004_REGISTRY_ADDRESS");
const registryAbi = JSON.parse(
  fs.readFileSync(path.join(rootDir, "lib", "contracts", "abis", "ERC8004AgentRegistry.json"), "utf8")
);
const arcMainnet = getArcChain(process.env);
const account = privateKeyToAccount(getWorkerPrivateKey());
const publicClient = createPublicClient({
  chain: arcMainnet,
  transport: http(rpcUrl)
});
const walletClient = createWalletClient({
  account,
  chain: arcMainnet,
  transport: http(rpcUrl)
});
await assertArcContracts(publicClient, [registryAddress]);
const configuredAgentId = process.env.NEXT_PUBLIC_ARCTASK_MANAGED_AGENT_ID;
if (configuredAgentId) {
  try {
    const configuredOwner = await publicClient.readContract({
      address: registryAddress,
      abi: registryAbi,
      functionName: "getAgentOwner",
      args: [BigInt(configuredAgentId)]
    });
    if (configuredOwner.toLowerCase() === account.address.toLowerCase()) {
      console.log(`Managed agent already registered: ${configuredAgentId}`);
      process.exit(0);
    }
  } catch {
    // The configured ID belongs to an older registry deployment or does not exist.
  }
}

const metadataUri = `data:application/json,${encodeURIComponent(JSON.stringify({
  schema: "arctask.agent.v1",
  name: "ArcTask Public General Agent",
  description: "Universal public autonomous worker for ArcTask jobs.",
  capabilities: [
    "general tasks",
    "web research",
    "payment review",
    "contract review",
    "product QA",
    "escrow deliverables"
  ],
  ownerWallet: account.address
}))}`;
const data = encodeFunctionData({ abi: registryAbi, functionName: "registerAgent", args: [account.address, metadataUri] });
const journalDir = path.join(rootDir, ".mainnet-deploy");
fs.mkdirSync(journalDir, { recursive: true, mode: 0o700 });
const journalPath = path.join(journalDir, `agent-${registryAddress.toLowerCase()}.json`);
let transaction = fs.existsSync(journalPath) ? JSON.parse(fs.readFileSync(journalPath, "utf8")) : null;
if (transaction && (transaction.owner !== account.address || transaction.dataHash !== keccak256(data))) {
  throw new Error("Managed-agent transaction journal differs from this account or registration.");
}
if (!transaction) {
  const latestNonce = await publicClient.getTransactionCount({ address: account.address, blockTag: "latest" });
  const pendingNonce = await publicClient.getTransactionCount({ address: account.address, blockTag: "pending" });
  if (latestNonce !== pendingNonce) throw new Error("Worker wallet has an unresolved transaction; reconcile it before registration.");
  const request = await walletClient.prepareTransactionRequest({ to: registryAddress, data, nonce: latestNonce });
  const rawTransaction = await walletClient.signTransaction(request);
  transaction = { owner: account.address, dataHash: keccak256(data), hash: keccak256(rawTransaction), nonce: latestNonce, rawTransaction };
  fs.writeFileSync(journalPath, JSON.stringify(transaction, null, 2), { mode: 0o600, flag: "wx" });
  await publicClient.sendRawTransaction({ serializedTransaction: rawTransaction });
}
const hash = transaction.hash;
const receipt = await waitForTransactionReceiptWithRetry(publicClient, hash);
if (receipt.status !== "success") {
  throw new Error(`Managed agent registration failed: ${hash}`);
}

const registeredEvent = parseEventLogs({
  abi: registryAbi,
  logs: receipt.logs,
  eventName: "AgentRegistered",
  strict: true
}).find((event) => event.address.toLowerCase() === registryAddress.toLowerCase());
const agentId = registeredEvent?.args?.agentId;
if (typeof agentId !== "bigint") {
  throw new Error("AgentRegistered event was not found.");
}

console.log(`NEXT_PUBLIC_ARCTASK_MANAGED_AGENT_ID=${agentId}`);
console.log(`Managed agent owner: ${account.address}`);
console.log(`Transaction: ${explorerUrl}/tx/${hash}`);
