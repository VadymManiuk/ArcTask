// An operator-run, funded check of the real worker. Journaling makes each step resumable.
import fs from "node:fs";
import path from "node:path";
import { createPublicClient, createWalletClient, encodeFunctionData, http, keccak256, parseUnits, stringToHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { assertArcContracts, getArcChain } from "../lib/arc-network.mjs";
import { loadLocalEnv } from "./load-env.mjs";
import { waitForTransactionReceiptWithRetry, withRpcRetry } from "./arc-rpc.mjs";

loadLocalEnv();
const action = process.argv[2];
if (!["create", "settle"].includes(action) || !process.argv.includes("--execute")) {
  throw new Error("Use create --execute, then review the worker report and use settle --execute --report=/path/report.json.");
}
const chain = getArcChain(process.env);
const key = process.env.ARC_MAINNET_DEPLOYER_PRIVATE_KEY;
if (!key) throw new Error("ARC_MAINNET_DEPLOYER_PRIVATE_KEY is required.");
const account = privateKeyToAccount(key.startsWith("0x") ? key : `0x${key}`);
const client = createPublicClient({ chain, transport: http(chain.rpcUrls.default.http[0], { timeout: 15_000, retryCount: 1 }) });
const wallet = createWalletClient({ account, chain, transport: http(chain.rpcUrls.default.http[0], { retryCount: 0 }) });
const escrow = process.env.NEXT_PUBLIC_ERC8183_ESCROW_V4_ADDRESS;
const registry = process.env.NEXT_PUBLIC_ERC8004_REGISTRY_ADDRESS;
const abi = JSON.parse(fs.readFileSync("lib/contracts/abis/ERC8183EscrowV2.json", "utf8"));
await withRpcRetry(() => assertArcContracts(client, [registry, escrow]), { maxAttempts: 3 });
const journalPath = path.join(".mainnet-deploy", `launch-${escrow.toLowerCase()}.json`);
let journal = fs.existsSync(journalPath) ? JSON.parse(fs.readFileSync(journalPath, "utf8")) : null;
function save() {
  fs.mkdirSync(path.dirname(journalPath), { recursive: true, mode: 0o700 });
  fs.writeFileSync(`${journalPath}.tmp`, JSON.stringify(journal, null, 2), { mode: 0o600 });
  fs.renameSync(`${journalPath}.tmp`, journalPath);
}
const read = (functionName, args = []) => withRpcRetry(() => client.readContract({ address: escrow, abi, functionName, args }), { maxAttempts: 3 });
if (!journal) {
  if (action !== "create") throw new Error("Create the check job first.");
  journal = { chainId: chain.id, owner: account.address, escrow, jobId: (await read("nextJobId")).toString(), deadline: Math.floor(Date.now() / 1000) + 86400, transactions: {} };
  save();
}
if (journal.chainId !== chain.id || journal.owner !== account.address || journal.escrow !== escrow) throw new Error("Launch-check journal mismatch.");
async function send(name, functionName, args = [], value = 0n) {
  let tx = journal.transactions[name];
  if (!tx) {
    const latest = await client.getTransactionCount({ address: account.address, blockTag: "latest" });
    const pending = await client.getTransactionCount({ address: account.address, blockTag: "pending" });
    if (latest !== pending) throw new Error("Wallet has a pending transaction. Wait for confirmation before continuing.");
    const data = encodeFunctionData({ abi, functionName, args });
    const request = await wallet.prepareTransactionRequest({ to: escrow, data, value, nonce: latest });
    if (request.gas * request.maxFeePerGas > parseUnits("0.1", 18)) throw new Error("Check transaction exceeds the 0.1 USDC gas ceiling.");
    const rawTransaction = await wallet.signTransaction(request);
    tx = { hash: keccak256(rawTransaction), nonce: latest, rawTransaction };
    journal.transactions[name] = tx;
    save();
    await client.sendRawTransaction({ serializedTransaction: rawTransaction });
  }
  const receipt = await waitForTransactionReceiptWithRetry(client, tx.hash, { maxAttempts: 3 });
  if (receipt.status !== "success") throw new Error(`Launch check reverted: ${tx.hash}`);
  tx.blockNumber = receipt.blockNumber.toString();
  tx.gasCost = (receipt.gasUsed * receipt.effectiveGasPrice).toString();
  save();
  console.log(`${name}: ${tx.hash}`);
}
const jobId = BigInt(journal.jobId);
if (action === "create") {
  const reward = parseUnits("0.01", 18);
  const quote = await read("quoteFunding", [reward]);
  const payload = { schema: "arctask.internal-smoke.v2", title: "Format a four-step checklist", description: "Return exactly four bullets using these headings: Input, Action, Output, Check. Each bullet should contain its heading followed by one short sentence. Use this order. Do not add an introduction or conclusion." };
  const jobURI = `data:application/json,${encodeURIComponent(JSON.stringify(payload))}`;
  await send("create", "createJob", [BigInt(process.env.NEXT_PUBLIC_ARCTASK_MANAGED_AGENT_ID), reward, BigInt(journal.deadline), account.address, jobURI], quote[0]);
  console.log(`Wait for the worker to submit job ${jobId}; review its private report before settlement.`);
} else {
  const reportPath = process.argv.find((arg) => arg.startsWith("--report="))?.slice(9);
  if (!reportPath) throw new Error("A reviewed --report path is required.");
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  const canonical = { ...report };
  delete canonical.deliverableHash;
  delete canonical.txHash;
  delete canonical.txUrl;
  const hash = keccak256(stringToHex(JSON.stringify(canonical, null, 2)));
  const job = await read("jobs", [jobId]);
  if (hash !== job[7] || hash !== report.deliverableHash) throw new Error("Reviewed report does not match the onchain commitment.");
  if (job[0].toLowerCase() !== account.address.toLowerCase() || ![1, 2].includes(Number(job[8]))) throw new Error("Unexpected job owner or status.");
  await send("accept", "acceptWork", [jobId]);
  await send("withdraw", "withdraw");
  if ((await read("jobs", [jobId]))[8] !== 2 || (await read("claimable", [account.address])) !== 0n) throw new Error("Settlement reconciliation failed.");
  fs.writeFileSync("deployments/mainnet-launch-check.json", JSON.stringify({ chainId: chain.id, jobId: journal.jobId, escrow, deliverableHash: hash, workerSubmitTx: report.txHash, transactions: Object.fromEntries(Object.entries(journal.transactions).map(([name, tx]) => [name, { hash: tx.hash, blockNumber: tx.blockNumber, gasCost: tx.gasCost }])) }, null, 2) + "\n");
  console.log("Confirmed worker execution, acceptance and withdrawal.");
}
