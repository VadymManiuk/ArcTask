import fs from "node:fs";
import { createPublicClient, formatUnits, http, keccak256 } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { assertArcContracts, getArcChain, getDeploymentScope } from "../lib/arc-network.mjs";
import { loadLocalEnv } from "./load-env.mjs";

loadLocalEnv();
const chain = getArcChain(process.env);
const registry = process.env.NEXT_PUBLIC_ERC8004_REGISTRY_ADDRESS;
const escrow = process.env.NEXT_PUBLIC_ERC8183_ESCROW_V4_ADDRESS;
const rpcUrls = [...new Set([chain.rpcUrls.default.http[0], process.env.ARC_AGENT_READ_RPC_URL, process.env.ARC_SECONDARY_RPC_URL].filter(Boolean))];
const registryAbi = JSON.parse(fs.readFileSync("lib/contracts/abis/ERC8004AgentRegistry.json", "utf8"));
const escrowAbi = JSON.parse(fs.readFileSync("lib/contracts/abis/ERC8183EscrowV2.json", "utf8"));
if (process.env.ARC_AGENT_RECOVERY_JOB_IDS?.trim() || /^(true|1|yes|on)$/i.test(process.env.ARC_AGENT_DEMO_SUBSIDY || "")) {
  throw new Error("Clear all testnet recovery IDs and subsidies before starting mainnet.");
}
const manifest = fs.existsSync("deployments/arc-mainnet.json") ? JSON.parse(fs.readFileSync("deployments/arc-mainnet.json", "utf8")) : null;
if (!manifest || manifest.chainId !== chain.id || manifest.registry.toLowerCase() !== registry?.toLowerCase() || manifest.escrowV4.toLowerCase() !== escrow?.toLowerCase()) {
  throw new Error("A matching verified deployments/arc-mainnet.json manifest is required.");
}
for (const url of rpcUrls) {
  const client = createPublicClient({ chain, transport: http(url, { timeout: 15_000, retryCount: 1 }) });
  await assertArcContracts(client, [registry, escrow, chain.contracts.multicall3.address]);
  const [registryCode, escrowCode, linkedRegistry, authorized, treasury, arbitrator] = await Promise.all([
    client.getCode({ address: registry }), client.getCode({ address: escrow }),
    client.readContract({ address: escrow, abi: escrowAbi, functionName: "registry" }),
    client.readContract({ address: registry, abi: registryAbi, functionName: "authorizedEscrows", args: [escrow] }),
    client.readContract({ address: escrow, abi: escrowAbi, functionName: "treasury" }),
    client.readContract({ address: escrow, abi: escrowAbi, functionName: "arbitrator" })
  ]);
  if (!authorized || linkedRegistry.toLowerCase() !== registry.toLowerCase() || treasury.toLowerCase() !== manifest.treasury.toLowerCase() || arbitrator.toLowerCase() !== manifest.arbitrator.toLowerCase()) {
    throw new Error("Mainnet contract wiring differs from the deployment manifest.");
  }
  if (keccak256(registryCode) !== manifest.registryCodeHash || keccak256(escrowCode) !== manifest.escrowCodeHash) {
    throw new Error("Mainnet runtime bytecode differs from the confirmed deployment.");
  }
  const managedId = process.env.NEXT_PUBLIC_ARCTASK_MANAGED_AGENT_ID;
  const workerKey = process.env.ARC_AGENT_PRIVATE_KEY || process.env.ARC_AGENT_PRIVATE_KEYS?.split(",")[0]?.trim();
  if (!managedId || !workerKey) throw new Error("Register and configure the managed agent and worker wallet before launch.");
  const worker = privateKeyToAccount(workerKey.startsWith("0x") ? workerKey : `0x${workerKey}`);
  const owner = await client.readContract({ address: registry, abi: registryAbi, functionName: "getAgentOwner", args: [BigInt(managedId)] });
  const balance = await client.getBalance({ address: worker.address });
  if (owner.toLowerCase() !== worker.address.toLowerCase()) throw new Error("Managed agent owner differs from worker wallet.");
  if (balance === 0n) throw new Error(`Worker ${worker.address} needs mainnet USDC for gas.`);
  console.log(JSON.stringify({ chainId: chain.id, rpcHost: new URL(url).hostname, registry, escrow, managedAgentId: managedId, worker: worker.address, workerBalanceUsdc: formatUnits(balance, 18), deploymentScope: getDeploymentScope(registry, escrow), ok: true }));
}
