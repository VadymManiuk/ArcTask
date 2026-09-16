import fs from "node:fs";
import path from "node:path";
import { createPublicClient, createWalletClient, encodeDeployData, encodeFunctionData, formatUnits, getContractAddress, http, isAddress, keccak256, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { assertArcMainnet, getArcChain } from "../lib/arc-network.mjs";
import { compileContracts, writeContractAbis } from "./compile-contracts.mjs";
import { loadLocalEnv } from "./load-env.mjs";
import { withRpcRetry, waitForTransactionReceiptWithRetry } from "./arc-rpc.mjs";

loadLocalEnv();
const compiled = compileContracts();
writeContractAbis(compiled);
if (process.argv.includes("--compile-only")) {
  console.log("Solidity contracts compiled successfully (Paris EVM target).");
  process.exit(0);
}

const chain = getArcChain(process.env);
const client = createPublicClient({ chain, transport: http(chain.rpcUrls.default.http[0], { timeout: 15_000, retryCount: 2 }) });
await withRpcRetry(() => assertArcMainnet(client), { maxAttempts: 3 });
const key = process.env.ARC_MAINNET_DEPLOYER_PRIVATE_KEY;
if (!key && (process.argv.includes("--execute") || !isAddress(process.env.ARCTASK_DEPLOYER_ADDRESS || ""))) {
  throw new Error("Set ARCTASK_DEPLOYER_ADDRESS for a read-only plan, or ARC_MAINNET_DEPLOYER_PRIVATE_KEY for execution.");
}
const account = key ? privateKeyToAccount(key.startsWith("0x") ? key : `0x${key}`) : { address: process.env.ARCTASK_DEPLOYER_ADDRESS };
const wallet = createWalletClient({ account, chain, transport: http(chain.rpcUrls.default.http[0], { retryCount: 0 }) });
const treasury = process.env.ARCTASK_TREASURY_ADDRESS || account.address;
const arbitrator = process.env.ARCTASK_ARBITRATOR_ADDRESS || account.address;
for (const address of [treasury, arbitrator]) {
  if (!isAddress(address) || /^0x0{40}$/i.test(address)) throw new Error("Treasury and arbitrator must be nonzero addresses.");
}
const journalPath = path.resolve(".mainnet-deploy", "journal.json");
fs.mkdirSync(path.dirname(journalPath), { recursive: true, mode: 0o700 });
let journal = fs.existsSync(journalPath) ? JSON.parse(fs.readFileSync(journalPath, "utf8")) : null;
const nonce = await client.getTransactionCount({ address: account.address, blockTag: "latest" });
const pendingNonce = await client.getTransactionCount({ address: account.address, blockTag: "pending" });
if (!journal && nonce !== pendingNonce) throw new Error("Deployer has pending transactions. Resolve them before deployment.");
const registry = journal?.registry || getContractAddress({ from: account.address, nonce: BigInt(nonce) });
const escrow = journal?.escrow || getContractAddress({ from: account.address, nonce: BigInt(nonce + 1) });
const initialJobId = 3_000_000n;
const operations = [
  { name: "registry", data: encodeDeployData({ abi: compiled.registry.abi, bytecode: `0x${compiled.registry.evm.bytecode.object}` }), gas: 2_000_000n },
  { name: "escrowV4", data: encodeDeployData({ abi: compiled.escrowV2.abi, bytecode: `0x${compiled.escrowV2.evm.bytecode.object}`, args: [registry, treasury, arbitrator, initialJobId] }), gas: 5_500_000n },
  { name: "authorize", to: registry, data: encodeFunctionData({ abi: compiled.registry.abi, functionName: "setEscrowAuthorization", args: [escrow, true] }), gas: 150_000n }
];
const fingerprint = keccak256(`0x${operations.map((operation) => operation.data.slice(2)).join("")}`);
if (journal && (journal.deployer.toLowerCase() !== account.address.toLowerCase() || journal.fingerprint !== fingerprint || journal.chainId !== chain.id)) {
  throw new Error("Deployment journal differs from this wallet or compiled configuration. Inspect it before proceeding.");
}
const fees = await client.estimateFeesPerGas();
const maxFeePerGas = fees.maxFeePerGas < 20_000_000_000n ? 20_000_000_000n : fees.maxFeePerGas;
const gasBudget = operations.filter((operation) => !journal?.transactions[operation.name]?.confirmed)
  .reduce((sum, operation) => sum + operation.gas, 0n) * maxFeePerGas;
const maxCost = parseUnits(process.env.ARCTASK_DEPLOY_MAX_COST_USDC || "1", 18);
const balance = await client.getBalance({ address: account.address });
console.log(JSON.stringify({ chainId: chain.id, deployer: account.address, registry, escrowV4: escrow, treasury, arbitrator, balanceUsdc: formatUnits(balance, 18), maximumGasCostUsdc: formatUnits(gasBudget, 18), costCapUsdc: formatUnits(maxCost, 18), mode: process.argv.includes("--execute") ? "execute" : "plan" }, null, 2));
if (!process.argv.includes("--execute")) process.exit(0);
if (gasBudget > maxCost) throw new Error("Deployment gas estimate exceeds ARCTASK_DEPLOY_MAX_COST_USDC.");
if (balance < gasBudget) throw new Error("Insufficient native mainnet USDC for the deployment gas budget.");
journal ??= { chainId: chain.id, deployer: account.address, registry, escrow, fingerprint, initialNonce: nonce, transactions: {} };
function save() {
  fs.writeFileSync(`${journalPath}.tmp`, JSON.stringify(journal, null, 2), { mode: 0o600 });
  fs.renameSync(`${journalPath}.tmp`, journalPath);
}
save();
for (const [index, operation] of operations.entries()) {
  await withRpcRetry(() => assertArcMainnet(client), { maxAttempts: 3 });
  let entry = journal.transactions[operation.name];
  if (!entry) {
    const expectedNonce = journal.initialNonce + index;
    const currentNonce = await client.getTransactionCount({ address: account.address, blockTag: "pending" });
    if (currentNonce !== expectedNonce) throw new Error("Deployer nonce changed outside this deployment. Reconcile before continuing.");
    const { name: _name, ...transaction } = operation;
    const request = await wallet.prepareTransactionRequest({ ...transaction, nonce: expectedNonce, maxFeePerGas, maxPriorityFeePerGas: fees.maxPriorityFeePerGas });
    const rawTransaction = await wallet.signTransaction(request);
    entry = { hash: keccak256(rawTransaction), nonce: expectedNonce, rawTransaction };
    journal.transactions[operation.name] = entry;
    save();
    // Persist the signed bytes and hash before broadcasting. Never sign a replacement on retry.
    await client.sendRawTransaction({ serializedTransaction: rawTransaction });
  }
  console.log(`${operation.name}: ${entry.hash}`);
  const receipt = await waitForTransactionReceiptWithRetry(client, entry.hash, { maxAttempts: 3 });
  if (receipt.status !== "success") throw new Error(`Deployment transaction reverted: ${entry.hash}`);
  if (index < 2 && receipt.contractAddress?.toLowerCase() !== (index === 0 ? registry : escrow).toLowerCase()) {
    throw new Error("Deployment receipt contract address mismatch.");
  }
  entry.blockNumber = receipt.blockNumber.toString();
  entry.confirmed = true;
  save();
}
const [registryCode, escrowCode, linkedRegistry, authorized] = await Promise.all([
  client.getCode({ address: registry }), client.getCode({ address: escrow }),
  client.readContract({ address: escrow, abi: compiled.escrowV2.abi, functionName: "registry" }),
  client.readContract({ address: registry, abi: compiled.registry.abi, functionName: "authorizedEscrows", args: [escrow] })
]);
if (!registryCode || !escrowCode || linkedRegistry.toLowerCase() !== registry.toLowerCase() || !authorized) throw new Error("Deployed contract verification failed.");
fs.mkdirSync("deployments", { recursive: true });
fs.writeFileSync("deployments/arc-mainnet.json", JSON.stringify({ chainId: chain.id, registry, escrowV4: escrow, treasury, arbitrator, initialJobId: initialJobId.toString(), deployer: account.address, registryCodeHash: keccak256(registryCode), escrowCodeHash: keccak256(escrowCode), transactions: Object.fromEntries(Object.entries(journal.transactions).map(([name, entry]) => [name, { hash: entry.hash, blockNumber: entry.blockNumber }])) }, null, 2) + "\n");
fs.writeFileSync("deployments/arc-mainnet.env", `NEXT_PUBLIC_ARC_MODE=onchain\nNEXT_PUBLIC_ARC_RPC_URL=${chain.rpcUrls.default.http[0]}\nNEXT_PUBLIC_ARC_EXPLORER_URL=${chain.blockExplorers.default.url}\nNEXT_PUBLIC_ERC8004_REGISTRY_ADDRESS=${registry}\nNEXT_PUBLIC_ERC8183_ESCROW_ADDRESS=\nNEXT_PUBLIC_ERC8183_ESCROW_V2_ADDRESS=\nNEXT_PUBLIC_ERC8183_ESCROW_V3_ADDRESS=\nNEXT_PUBLIC_ERC8183_ESCROW_V4_ADDRESS=${escrow}\nNEXT_PUBLIC_ESCROW_V4_INITIAL_JOB_ID=${initialJobId}\nNEXT_PUBLIC_USDC_ADDRESS=native\n`);
console.log("Confirmed deployment saved to deployments/arc-mainnet.json and deployments/arc-mainnet.env.");
