import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { encodeFunctionData, keccak256, parseUnits, stringToHex } from "viem";

export function durableJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${randomUUID()}.tmp`;
  const fd = fs.openSync(temporary, "wx", 0o600);
  try {
    fs.writeFileSync(fd, JSON.stringify(value, (_, v) => typeof v === "bigint" ? v.toString() : v, 2));
    fs.fsyncSync(fd);
  } finally { fs.closeSync(fd); }
  fs.renameSync(temporary, file);
  const directory = fs.openSync(path.dirname(file), "r");
  try { fs.fsyncSync(directory); } finally { fs.closeSync(directory); }
}

export function readDurableJson(file, fallback = null) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (error) { if (error.code === "ENOENT") return fallback; throw error; }
}

export function acquireProcessLock(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const token = randomUUID();
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      fs.writeFileSync(file, JSON.stringify({ pid: process.pid, token }), { flag: "wx", mode: 0o600 });
      return { release() {
        if (readDurableJson(file)?.token === token) fs.unlinkSync(file);
      } };
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      const owner = readDurableJson(file);
      if (!Number.isInteger(owner?.pid) || owner.pid <= 0) throw new Error(`Invalid worker lock: ${file}`);
      try { process.kill(owner.pid, 0); return null; }
      catch (probe) {
        if (probe.code !== "ESRCH") return null;
        if (readDurableJson(file)?.token === owner.token) fs.unlinkSync(file);
      }
    }
  }
  return null;
}

export function executionFingerprint(job) {
  return keccak256(stringToHex(JSON.stringify({
    client: job.client.toLowerCase(), agentOwner: job.agentOwner.toLowerCase(),
    agentId: String(job.agentId), evaluator: job.evaluator.toLowerCase(),
    deadline: String(job.deadline), jobURI: job.jobURI,
    rewardAmount: String(job.rewardAmount), executionVersion: job.executionVersion ?? 1,
    executionBudgetAmount: String(job.executionBudgetAmount ?? job.rewardAmount),
    updatedAt: String(job.updatedAt)
  })));
}

function isMissingTransaction(error) {
  return ["TransactionReceiptNotFoundError", "TransactionNotFoundError"].includes(error?.name);
}

function publishReport(journal, outputDir) {
  const report = journal.deliverable.report;
  if (keccak256(stringToHex(JSON.stringify(report, null, 2))) !== journal.deliverable.hash) {
    throw new Error("Saved deliverable integrity check failed.");
  }
  const file = path.join(outputDir, `job-${journal.jobId}.json`);
  durableJson(file, { ...report, deliverableHash: journal.deliverable.hash,
    txHash: journal.transaction.hash, txUrl: `${journal.explorerUrl}/tx/${journal.transaction.hash}` });
}

export async function resumeSubmission({ file, journal, client, outputDir }) {
  const transaction = journal.transaction;
  if (!transaction || journal.status === "confirmed") return true;
  if (journal.status === "reverted") throw new Error(`Submission reverted: ${transaction.hash}`);
  if (keccak256(transaction.raw) !== transaction.hash) throw new Error("Saved transaction integrity check failed.");
  // This also recreates a report lost between the journal write and publication.
  publishReport(journal, outputDir);
  let receipt;
  try { receipt = await client.getTransactionReceipt({ hash: transaction.hash }); }
  catch (error) { if (!isMissingTransaction(error)) throw error; }
  if (receipt) {
    journal.status = receipt.status === "success" ? "confirmed" : "reverted";
    journal.blockNumber = String(receipt.blockNumber);
    durableJson(file, journal);
    if (receipt.status !== "success") throw new Error(`Submission reverted: ${transaction.hash}`);
    return true;
  }
  let known;
  try { known = await client.getTransaction({ hash: transaction.hash }); }
  catch (error) { if (!isMissingTransaction(error)) throw error; }
  if (known) return false;
  const latest = await client.getTransactionCount({ address: journal.account, blockTag: "latest" });
  const pending = await client.getTransactionCount({ address: journal.account, blockTag: "pending" });
  if (latest > transaction.nonce) throw new Error(`Nonce consumed; reconcile saved submission ${transaction.hash}.`);
  if (latest !== transaction.nonce || pending !== transaction.nonce) return false;
  // Only the same signed bytes may be rebroadcast, and only into an unoccupied nonce.
  try { await client.sendRawTransaction({ serializedTransaction: transaction.raw }); }
  catch { /* RPC acknowledgement is not proof of failure. Keep the signed journal. */ }
  return false;
}

export async function recoverSubmissions({ directory, client, outputDir, chainId, escrowAddresses }) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  let pending = false;
  let confirmed = 0;
  for (const name of fs.readdirSync(directory).filter(name => name.endsWith(".json"))) {
    const file = path.join(directory, name);
    const journal = readDurableJson(file);
    if (journal.chainId !== chainId || !escrowAddresses.some(address => address.toLowerCase() === journal.escrow.toLowerCase())) {
      throw new Error("Submission journal belongs to a different deployment.");
    }
    if (journal.transaction && journal.status !== "confirmed" && journal.status !== "reverted") {
      if (!await resumeSubmission({ file, journal, client, outputDir })) pending = true;
      else confirmed++;
    }
  }
  return { ready: !pending, confirmed };
}

export async function submitDurably({ directory, outputDir, chainId, escrow, abi, jobId, job,
  account, wallet, client, readJob, generate, explorerUrl, maxFeeUsdc = "0.1" }) {
  const fingerprint = executionFingerprint(job);
  const file = path.join(directory, `${escrow.toLowerCase()}-${jobId}-${job.executionVersion ?? 1}-${fingerprint.slice(2, 18)}.json`);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  // Even if RPC pending state lags, never sign a second job over an unresolved journal.
  for (const name of fs.readdirSync(directory).filter(name => name.endsWith(".json"))) {
    const otherFile = path.join(directory, name);
    if (otherFile === file) continue;
    const other = readDurableJson(otherFile);
    if (other.transaction && !["confirmed", "reverted"].includes(other.status)) {
      throw new Error("An unresolved saved submission must be reconciled before another job.");
    }
  }
  let journal = readDurableJson(file);
  if (!journal) {
    const latest = await client.getTransactionCount({ address: account.address, blockTag: "latest" });
    if (await client.getTransactionCount({ address: account.address, blockTag: "pending" }) !== latest) {
      throw new Error("Worker wallet has a pending transaction; waiting before spending AI budget.");
    }
    const deliverable = await generate();
    journal = { chainId, escrow, jobId: String(jobId), account: account.address, fingerprint,
      explorerUrl, status: "prepared", deliverable: { report: deliverable.report, hash: deliverable.hash } };
    durableJson(file, journal);
  }
  if (journal.account.toLowerCase() !== account.address.toLowerCase() || journal.fingerprint !== fingerprint) {
    throw new Error("Submission journal does not match this execution.");
  }
  if (journal.transaction) return resumeSubmission({ file, journal, client, outputDir });
  const current = await readJob();
  if (current.status !== 0 || executionFingerprint(current) !== fingerprint || BigInt(current.deadline) <= BigInt(Math.floor(Date.now() / 1000))) {
    return false;
  }
  const latest = await client.getTransactionCount({ address: account.address, blockTag: "latest" });
  if (await client.getTransactionCount({ address: account.address, blockTag: "pending" }) !== latest) {
    throw new Error("Worker wallet has an external pending transaction; saved result retained.");
  }
  const data = encodeFunctionData({ abi, functionName: "submitDeliverable", args: [jobId, journal.deliverable.hash] });
  const request = await wallet.prepareTransactionRequest({ to: escrow, data, nonce: latest, value: 0n });
  if (request.gas * (request.maxFeePerGas ?? request.gasPrice) > parseUnits(maxFeeUsdc, 18)) {
    throw new Error("Submission gas exceeds ARC_AGENT_MAX_TX_FEE_USDC; saved result retained.");
  }
  // Preparation can be slow. Refresh both the brief and nonce immediately before signing.
  const beforeSign = await readJob();
  if (beforeSign.status !== 0 || executionFingerprint(beforeSign) !== fingerprint) return false;
  if (await client.getTransactionCount({ address: account.address, blockTag: "pending" }) !== latest ||
      await client.getTransactionCount({ address: account.address, blockTag: "latest" }) !== latest) return false;
  const raw = await wallet.signTransaction(request);
  journal.transaction = { raw, hash: keccak256(raw), nonce: latest };
  journal.status = "signed";
  durableJson(file, journal);
  publishReport(journal, outputDir);
  return resumeSubmission({ file, journal, client, outputDir });
}
