import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import solc from "solc";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  parseEventLogs
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { waitForTransactionReceiptWithRetry } from "./arc-rpc.mjs";

const rootDir = process.cwd();
const envPath = path.join(rootDir, ".env.local");

function loadLocalEnv() {
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
    throw new Error(`${name} is required. Add it to .env.local or export it in your shell.`);
  }

  return value;
}

function normalizePrivateKey(value) {
  return value.startsWith("0x") ? value : `0x${value}`;
}

function readContractSource(fileName) {
  const filePath = path.join(rootDir, "contracts", fileName);
  return fs.readFileSync(filePath, "utf8");
}

function compileContracts() {
  const input = {
    language: "Solidity",
    sources: {
      "ArcTaskAgentRegistry.sol": {
        content: readContractSource("ArcTaskAgentRegistry.sol")
      },
      "ArcTaskEscrow.sol": {
        content: readContractSource("ArcTaskEscrow.sol")
      },
      "ArcTaskEscrowV2.sol": {
        content: readContractSource("ArcTaskEscrowV2.sol")
      }
    },
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      },
      outputSelection: {
        "*": {
          "*": ["abi", "evm.bytecode.object"]
        }
      }
    }
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  const errors = output.errors ?? [];
  const fatalErrors = errors.filter((error) => error.severity === "error");

  for (const error of errors) {
    const log = error.severity === "error" ? console.error : console.warn;
    log(error.formattedMessage);
  }

  if (fatalErrors.length > 0) {
    throw new Error("Solidity compilation failed.");
  }

  return {
    registry: output.contracts["ArcTaskAgentRegistry.sol"].ArcTaskAgentRegistry,
    escrow: output.contracts["ArcTaskEscrow.sol"].ArcTaskEscrow,
    escrowV2: output.contracts["ArcTaskEscrowV2.sol"].ArcTaskEscrowV2
  };
}

function writeContractAbis(compiled) {
  const abiDir = path.join(rootDir, "lib", "contracts", "abis");
  fs.mkdirSync(abiDir, { recursive: true });
  fs.writeFileSync(path.join(abiDir, "ERC8004AgentRegistry.json"), `${JSON.stringify(compiled.registry.abi, null, 2)}\n`);
  fs.writeFileSync(path.join(abiDir, "ERC8183Escrow.json"), `${JSON.stringify(compiled.escrow.abi, null, 2)}\n`);
  fs.writeFileSync(path.join(abiDir, "ERC8183EscrowV2.json"), `${JSON.stringify(compiled.escrowV2.abi, null, 2)}\n`);
}

async function deployContract({ walletClient, publicClient, contract, args }) {
  const hash = await walletClient.deployContract({
    abi: contract.abi,
    bytecode: `0x${contract.evm.bytecode.object}`,
    args
  });

  const receipt = await waitForTransactionReceiptWithRetry(publicClient, hash);
  if (receipt.status !== "success") {
    throw new Error(`Deployment failed: ${hash}`);
  }

  return receipt.contractAddress;
}

loadLocalEnv();

if (process.argv.includes("--compile-only")) {
  const compiled = compileContracts();
  writeContractAbis(compiled);
  console.log("Solidity contracts compiled successfully.");
  process.exit(0);
}

const rpcUrl = process.env.NEXT_PUBLIC_ARC_RPC_URL ?? "https://rpc.testnet.arc.network";
const explorerUrl = process.env.NEXT_PUBLIC_ARC_EXPLORER_URL ?? "https://testnet.arcscan.app";
const privateKey = normalizePrivateKey(requiredEnv("ARC_TESTNET_DEPLOYER_PRIVATE_KEY"));
const deployEscrowOnly = process.argv.includes("--escrow-only");
const deployEscrowV2Only = process.argv.includes("--escrow-v2-only");
if (deployEscrowOnly && deployEscrowV2Only) {
  throw new Error("Choose either --escrow-only or --escrow-v2-only.");
}

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

const account = privateKeyToAccount(privateKey);
const publicClient = createPublicClient({
  chain: arcTestnet,
  transport: http(rpcUrl)
});
const walletClient = createWalletClient({
  account,
  chain: arcTestnet,
  transport: http(rpcUrl)
});

console.log(`Deploying from ${account.address} to ${arcTestnet.name} (${arcTestnet.id})`);
console.log("Escrow uses Arc native testnet USDC via msg.value.");

const compiled = compileContracts();
writeContractAbis(compiled);

const registryAddress = deployEscrowOnly || deployEscrowV2Only
  ? requiredEnv("NEXT_PUBLIC_ERC8004_REGISTRY_ADDRESS")
  : await deployContract({
      walletClient,
      publicClient,
      contract: compiled.registry,
      args: []
    });
if (!deployEscrowOnly && !deployEscrowV2Only) {
  console.log(`Agent registry deployed: ${registryAddress}`);
} else {
  console.log(`Using existing agent registry: ${registryAddress}`);
}

const treasuryAddress = process.env.ARCTASK_TREASURY_ADDRESS ?? account.address;
const arbitratorAddress = process.env.ARCTASK_ARBITRATOR_ADDRESS ?? account.address;
const initialV2JobId = BigInt(process.env.ARCTASK_V2_INITIAL_JOB_ID ?? "1000000");
const escrowAddress = await deployContract({
  walletClient,
  publicClient,
  contract: deployEscrowV2Only ? compiled.escrowV2 : compiled.escrow,
  args: deployEscrowV2Only
    ? [registryAddress, treasuryAddress, arbitratorAddress, initialV2JobId]
    : [registryAddress]
});
console.log(`Escrow deployed: ${escrowAddress}`);

const authorizationHash = await walletClient.writeContract({
  address: registryAddress,
  abi: compiled.registry.abi,
  functionName: "setEscrowAuthorization",
  args: [escrowAddress, true]
});
const authorizationReceipt = await waitForTransactionReceiptWithRetry(publicClient, authorizationHash);
if (authorizationReceipt.status !== "success") {
  throw new Error(`Escrow authorization failed: ${authorizationHash}`);
}
console.log(`Escrow authorized in registry: ${authorizationHash}`);

let managedAgentId;
if (!deployEscrowV2Only && process.env.ARC_AGENT_PRIVATE_KEY) {
  const managedAccount = privateKeyToAccount(normalizePrivateKey(process.env.ARC_AGENT_PRIVATE_KEY));
  const managedWalletClient = createWalletClient({
    account: managedAccount,
    chain: arcTestnet,
    transport: http(rpcUrl)
  });
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
    ownerWallet: managedAccount.address
  }))}`;
  const managedRegistrationHash = await managedWalletClient.writeContract({
    address: registryAddress,
    abi: compiled.registry.abi,
    functionName: "registerAgent",
    args: [managedAccount.address, metadataUri]
  });
  const managedRegistrationReceipt = await waitForTransactionReceiptWithRetry(publicClient, managedRegistrationHash);
  if (managedRegistrationReceipt.status !== "success") {
    throw new Error(`Managed agent registration failed: ${managedRegistrationHash}`);
  }

  const managedRegistrationEvent = parseEventLogs({
    abi: compiled.registry.abi,
    logs: managedRegistrationReceipt.logs,
    eventName: "AgentRegistered",
    strict: true
  }).find((event) => event.address.toLowerCase() === registryAddress.toLowerCase());
  managedAgentId = managedRegistrationEvent?.args?.agentId;
  if (typeof managedAgentId !== "bigint") {
    throw new Error("Managed AgentRegistered event was not found.");
  }
  console.log(`Managed agent registered: ${managedAgentId} (${managedRegistrationHash})`);
}

console.log("\nAdd these to .env.local and production:");
if (deployEscrowV2Only) {
  console.log(`NEXT_PUBLIC_ERC8183_ESCROW_V2_ADDRESS=${escrowAddress}`);
  console.log(`ARCTASK_TREASURY_ADDRESS=${treasuryAddress}`);
  console.log(`ARCTASK_ARBITRATOR_ADDRESS=${arbitratorAddress}`);
  console.log(`ARCTASK_V2_INITIAL_JOB_ID=${initialV2JobId}`);
  console.log(`NEXT_PUBLIC_ESCROW_V2_INITIAL_JOB_ID=${initialV2JobId}`);
} else {
  console.log("NEXT_PUBLIC_ARC_MODE=onchain");
  console.log(`NEXT_PUBLIC_ERC8004_REGISTRY_ADDRESS=${registryAddress}`);
  console.log(`NEXT_PUBLIC_ERC8183_ESCROW_ADDRESS=${escrowAddress}`);
  console.log("NEXT_PUBLIC_USDC_ADDRESS=native");
  if (managedAgentId !== undefined) {
    console.log(`NEXT_PUBLIC_ARCTASK_MANAGED_AGENT_ID=${managedAgentId}`);
  }
}
console.log(`\nExplorer: ${explorerUrl}/address/${escrowAddress}`);
