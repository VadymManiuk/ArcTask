import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  formatUnits,
  http,
  keccak256,
  stringToHex
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const rootDir = process.cwd();
const defaultRegistryAddress = "0x4ab5791a689b15126fcc7a549f8e4c7e16c5e0b8";
const defaultEscrowAddress = "0x58ca473df727301bce771d6087f883364c83a3b6";
const defaultRpcUrl = "https://rpc.testnet.arc.network";
const defaultExplorerUrl = "https://testnet.arcscan.app";
const fundedStatus = 0;
const statusVersion = 1;
const defaultMaxJobPayloadChars = 8_000;

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
    throw new Error(`${name} is required. Add it to .env.local or export it before running the worker.`);
  }

  return value;
}

function optionalAddress(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (!/^0x[a-fA-F0-9]{40}$/.test(value)) {
    throw new Error(`${name} must be a valid 0x address.`);
  }

  return value;
}

function normalizePrivateKey(value) {
  return value.startsWith("0x") ? value : `0x${value}`;
}

function readAbi(fileName) {
  return JSON.parse(fs.readFileSync(path.join(rootDir, "lib/contracts/abis", fileName), "utf8"));
}

function getBooleanEnv(name, defaultValue) {
  const value = process.env[name];
  if (value === undefined) {
    return defaultValue;
  }

  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function getPositiveIntegerEnv(name, defaultValue) {
  const value = Number(process.env[name] ?? defaultValue);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return value;
}

function getOptionalPositiveIntegerEnv(name, defaultValue) {
  const rawValue = process.env[name];
  if (rawValue === undefined || rawValue === "") {
    return defaultValue;
  }

  return getPositiveIntegerEnv(name, defaultValue);
}

function getOpenAiSearchContext() {
  const value = (process.env.ARC_AGENT_WEB_SEARCH_CONTEXT ?? "low").toLowerCase();
  if (["low", "medium", "high"].includes(value)) {
    return value;
  }

  throw new Error("ARC_AGENT_WEB_SEARCH_CONTEXT must be low, medium, or high.");
}

function uniq(values) {
  return [...new Set(values)];
}

function parsePrivateKeys() {
  const rawMultiKeyValue = process.env.ARC_AGENT_PRIVATE_KEYS ?? "";
  const rawKeys = rawMultiKeyValue
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const allowDeployerFallback = getBooleanEnv("ARC_AGENT_ALLOW_DEPLOYER_FALLBACK", false);
  const fallbackKey =
    process.env.ARC_AGENT_PRIVATE_KEY ??
    (allowDeployerFallback ? process.env.ARC_TESTNET_DEPLOYER_PRIVATE_KEY : undefined);
  const keys = uniq(rawKeys.length > 0 ? rawKeys : fallbackKey ? [fallbackKey] : []);

  if (keys.length === 0) {
    requiredEnv("ARC_AGENT_PRIVATE_KEY");
  }

  return keys.map(normalizePrivateKey);
}

function sameAddress(left, right) {
  return left.toLowerCase() === right.toLowerCase();
}

function serializeBigInts(value) {
  return JSON.stringify(
    value,
    (_, nestedValue) => (typeof nestedValue === "bigint" ? nestedValue.toString() : nestedValue),
    2
  );
}

async function buildDeliverable(jobId, job, accountAddress, explorerUrl) {
  const payload = decodeJobPayloadUri(job.jobURI);
  const result = await buildAgentResult(jobId, job, payload);
  const report = {
    kind: "ArcTask autonomous agent deliverable",
    version: 1,
    generatedAt: new Date().toISOString(),
    worker: accountAddress,
    job: {
      jobId: jobId.toString(),
      agentId: job.agentId.toString(),
      client: job.client,
      agentOwner: job.agentOwner,
      evaluator: job.evaluator,
      rewardAmount: job.rewardAmount.toString(),
      rewardDisplay: `${formatUnits(job.rewardAmount, 18)} USDC`,
      deadline: Number(job.deadline),
      deadlineIso: new Date(Number(job.deadline) * 1000).toISOString(),
      jobURI: job.jobURI,
      payload,
      explorer: `${explorerUrl}/address/${escrowAddress}`
    },
    result
  };
  const content = serializeBigInts(report);
  return {
    content,
    hash: keccak256(stringToHex(content)),
    report
  };
}

async function buildAgentResult(jobId, job, payload) {
  if (!openAiApiKey) {
    return buildFallbackAgentResult(jobId, payload, "OPENAI_API_KEY is not configured.");
  }

  try {
    return await runOpenAiExecutor(jobId, job, payload);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "OpenAI executor failed.";
    return {
      ...buildFallbackAgentResult(jobId, payload, message),
      aiError: message
    };
  }
}

function buildFallbackAgentResult(jobId, payload, reason) {
  return {
    status: "completed",
    mode: "deterministic-fallback",
    title: payload?.title ?? `ArcTask job ${jobId.toString()}`,
    summary: buildResultSummary(jobId, payload),
    fallbackReason: reason
  };
}

async function runOpenAiExecutor(jobId, job, payload) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), openAiTimeoutMs);
  const tools = openAiWebSearchEnabled ? [{ type: "web_search", search_context_size: openAiWebSearchContext }] : undefined;
  const task = {
    jobId: jobId.toString(),
    payload,
    onchain: {
      agentId: job.agentId.toString(),
      client: job.client,
      agentOwner: job.agentOwner,
      evaluator: job.evaluator,
      rewardAmount: job.rewardAmount.toString(),
      rewardDisplay: `${formatUnits(job.rewardAmount, 18)} USDC`,
      deadlineIso: new Date(Number(job.deadline) * 1000).toISOString()
    }
  };

  try {
    const requestBody = {
      model: openAiModel,
      max_output_tokens: openAiMaxOutputTokens,
      ...(tools ? { tools } : {}),
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: openAiWebSearchEnabled
                ? [
                    "You are an autonomous ArcTask AI agent. Complete the requested task from the supplied onchain job payload.",
                    "When the task requires current market discovery, upcoming TGE/listing research, or fresh project data, use web search and cite source URLs in the deliverable.",
                    "Clearly separate verified facts, uncertain signals, assumptions, and risks. Do not invent token names, dates, funding data, or claims not supported by the payload or web sources.",
                    "Return a concise evaluator-ready deliverable in plain language. Prefer short sections named What I found, Recommendation, Risks, Sources, and Next steps. Avoid markdown code fences, raw heading markers, and long audit templates unless the job explicitly asks for source-code review."
                  ].join(" ")
                : [
                    "You are an autonomous ArcTask AI agent. Complete the requested task using only the supplied job payload.",
                    "If the task requires current market discovery, upcoming TGE/listing research, or fresh offchain data, state that web search is disabled and list the exact missing inputs needed to complete it.",
                    "Return a concise evaluator-ready deliverable in plain language with concrete output, assumptions, and verification notes. Avoid markdown code fences, raw heading markers, and long audit templates unless the job explicitly asks for source-code review. Do not claim offchain actions that were not performed."
                  ].join(" ")
            }
          ]
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: JSON.stringify(task, null, 2)
            }
          ]
        }
      ]
    };

    const response = await fetch(`${openAiBaseUrl}/responses`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${openAiApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestBody)
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = body?.error?.message ?? `OpenAI request failed with HTTP ${response.status}`;
      throw new Error(message);
    }

    const output = extractOpenAiText(body);
    if (!output) {
      throw new Error("OpenAI response did not include output text.");
    }

    return {
      status: "completed",
      mode: "openai",
      model: openAiModel,
      title: payload?.title ?? `ArcTask job ${jobId.toString()}`,
      summary: output
    };
  } finally {
    clearTimeout(timeout);
  }
}

function extractOpenAiText(body) {
  if (typeof body.output_text === "string") {
    return body.output_text.trim();
  }

  const chunks = [];
  for (const item of body.output ?? []) {
    for (const content of item.content ?? []) {
      if (typeof content.text === "string") {
        chunks.push(content.text);
      }
    }
  }

  return chunks.join("\n").trim();
}

function decodeJobPayloadUri(jobURI) {
  if (!jobURI.startsWith("data:application/json,")) {
    return null;
  }

  const encodedPayload = jobURI.slice("data:application/json,".length);
  if (encodedPayload.length > maxJobPayloadChars * 3) {
    return null;
  }

  try {
    const decoded = decodeURIComponent(encodedPayload);
    if (decoded.length > maxJobPayloadChars) {
      return null;
    }

    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

function buildResultSummary(jobId, payload) {
  if (!payload) {
    return `Autonomous worker completed ArcTask job ${jobId.toString()} and prepared an onchain deliverable hash for evaluator review.`;
  }

  return [
    `Completed requested task: ${payload.title ?? `ArcTask job ${jobId.toString()}`}.`,
    payload.description ? `Task description reviewed: ${payload.description}` : undefined,
    "The worker generated this structured report from the onchain job payload and submitted its hash to escrow."
  ]
    .filter(Boolean)
    .join(" ");
}

function ensureOutputDir() {
  const outputDir = process.env.ARC_AGENT_OUTPUT_DIR ?? path.join(rootDir, ".agent-worker", "deliverables");
  fs.mkdirSync(outputDir, { recursive: true });
  return outputDir;
}

function ensureRuntimeDirs() {
  const stateDir = process.env.ARC_AGENT_STATE_DIR ?? path.join(rootDir, ".agent-worker", "state");
  const lockDir = process.env.ARC_AGENT_LOCK_DIR ?? path.join(rootDir, ".agent-worker", "locks");
  fs.mkdirSync(stateDir, { recursive: true });
  fs.mkdirSync(lockDir, { recursive: true });
  return {
    stateDir,
    lockDir,
    statusPath: path.join(stateDir, "status.json")
  };
}

function atomicWriteJson(filePath, value) {
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, serializeBigInts(value));
  fs.renameSync(tempPath, filePath);
}

function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function createInitialStatus() {
  const now = new Date().toISOString();
  return {
    version: statusVersion,
    service: "arctask-worker",
    startedAt: now,
    updatedAt: now,
    lastHeartbeatAt: now,
    mode: dryRun ? "dry-run" : "live",
    executor: openAiApiKey ? `openai:${openAiModel}` : "deterministic-fallback",
    webSearchEnabled: Boolean(openAiApiKey && openAiWebSearchEnabled),
    rpcUrl,
    explorerUrl,
    escrowAddress,
    pollIntervalMs,
    maxJobsPerTick,
    staleLockMs,
    managedAgents: workerAccounts.map(({ account }) => ({
      address: account.address
    })),
    queue: {
      pending: 0,
      locked: 0,
      submitted: 0,
      skipped: 0,
      failed: 0
    },
    metrics: {
      ticks: 0,
      jobsScanned: 0,
      jobsSubmitted: 0,
      jobsSkipped: 0,
      errors: 0
    },
    recentEvents: []
  };
}

function writeStatus(patch = {}) {
  const previous = readJsonFile(statusPath, createInitialStatus());
  const next = {
    ...previous,
    ...patch,
    queue: {
      ...previous.queue,
      ...(patch.queue ?? {})
    },
    metrics: {
      ...previous.metrics,
      ...(patch.metrics ?? {})
    },
    updatedAt: new Date().toISOString(),
    lastHeartbeatAt: patch.lastHeartbeatAt ?? new Date().toISOString()
  };

  atomicWriteJson(statusPath, next);
  return next;
}

function appendStatusEvent(event) {
  const previous = readJsonFile(statusPath, createInitialStatus());
  const recentEvents = [
    {
      ...event,
      createdAt: new Date().toISOString()
    },
    ...(previous.recentEvents ?? [])
  ].slice(0, 40);

  return writeStatus({ recentEvents });
}

function listActiveLocks(lockDir) {
  try {
    return fs.readdirSync(lockDir).filter((fileName) => fileName.endsWith(".lock")).length;
  } catch {
    return 0;
  }
}

function acquireJobLock(lockDir, jobId, workerAddress) {
  const lockPath = path.join(lockDir, `job-${jobId.toString()}.lock`);
  const now = Date.now();

  try {
    const stat = fs.statSync(lockPath);
    if (now - stat.mtimeMs > staleLockMs) {
      fs.unlinkSync(lockPath);
    }
  } catch (caught) {
    if (caught.code !== "ENOENT") {
      throw caught;
    }
  }

  try {
    const fd = fs.openSync(lockPath, "wx");
    fs.writeFileSync(
      fd,
      serializeBigInts({
        jobId: jobId.toString(),
        worker: workerAddress,
        pid: process.pid,
        createdAt: new Date().toISOString()
      })
    );
    fs.closeSync(fd);
    return {
      lockPath,
      release() {
        try {
          fs.unlinkSync(lockPath);
        } catch {
          // Another watchdog or manual operator may have already removed it.
        }
      }
    };
  } catch (caught) {
    if (caught.code === "EEXIST") {
      return null;
    }

    throw caught;
  }
}

function writeDeliverable(outputDir, jobId, deliverable, txHash) {
  const filePath = path.join(outputDir, `job-${jobId.toString()}.json`);
  atomicWriteJson(filePath, {
    ...deliverable.report,
    deliverableHash: deliverable.hash,
    txHash,
    txUrl: txHash ? `${explorerUrl}/tx/${txHash}` : undefined
  });
  return filePath;
}

async function readJob(jobId) {
  const result = await publicClient.readContract({
    address: escrowAddress,
    abi: escrowAbi,
    functionName: "jobs",
    args: [jobId]
  });

  return {
    client: result[0],
    agentId: result[1],
    agentOwner: result[2],
    evaluator: result[3],
    rewardAmount: result[4],
    deadline: result[5],
    jobURI: result[6],
    deliverableHash: result[7],
    status: result[8],
    createdAt: result[9],
    updatedAt: result[10]
  };
}

async function submitJob(jobId, job, outputDir, dryRun, workerAccount) {
  const nowSeconds = BigInt(Math.floor(Date.now() / 1000));
  if (job.deadline <= nowSeconds) {
    console.log(`skip job ${jobId}: deadline expired`);
    return false;
  }

  const deliverable = await buildDeliverable(jobId, job, workerAccount.account.address, explorerUrl);
  if (dryRun) {
    const filePath = writeDeliverable(outputDir, jobId, deliverable);
    console.log(`dry-run job ${jobId}: would submit ${deliverable.hash}`);
    console.log(`saved ${path.relative(rootDir, filePath)}`);
    return true;
  }

  const txHash = await workerAccount.walletClient.writeContract({
    address: escrowAddress,
    abi: escrowAbi,
    functionName: "submitDeliverable",
    args: [jobId, deliverable.hash]
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  if (receipt.status !== "success") {
    throw new Error(`submitDeliverable failed for job ${jobId}: ${txHash}`);
  }

  const filePath = writeDeliverable(outputDir, jobId, deliverable, txHash);
  console.log(`submitted job ${jobId}: ${txHash}`);
  console.log(`saved ${path.relative(rootDir, filePath)}`);
  return true;
}

async function scanOnce({ dryRun, maxJobsPerTick, outputDir, lockDir }) {
  const nextJobId = await publicClient.readContract({
    address: escrowAddress,
    abi: escrowAbi,
    functionName: "nextJobId"
  });
  let handled = 0;
  let scanned = 0;
  let skipped = 0;
  let pending = 0;
  let failed = 0;
  const statusBeforeTick = readJsonFile(statusPath, createInitialStatus());

  for (let jobId = 1n; jobId < nextJobId; jobId += 1n) {
    const job = await readJob(jobId);
    scanned += 1;
    if (job.status !== fundedStatus) {
      continue;
    }

    const workerAccount = workerAccounts.find(({ account }) => sameAddress(job.agentOwner, account.address));
    if (!workerAccount) {
      continue;
    }

    pending += 1;
    const lock = acquireJobLock(lockDir, jobId, workerAccount.account.address);
    if (!lock) {
      skipped += 1;
      continue;
    }

    try {
      appendStatusEvent({
        type: "job_started",
        jobId: jobId.toString(),
        worker: workerAccount.account.address
      });
      await submitJob(jobId, job, outputDir, dryRun, workerAccount);
      handled += 1;
      appendStatusEvent({
        type: dryRun ? "job_dry_run" : "job_submitted",
        jobId: jobId.toString(),
        worker: workerAccount.account.address
      });
      if (handled >= maxJobsPerTick) {
        break;
      }
    } catch (caught) {
      failed += 1;
      const message = caught instanceof Error ? caught.message : "unknown submit error";
      appendStatusEvent({
        type: "job_failed",
        jobId: jobId.toString(),
        worker: workerAccount.account.address,
        error: message
      });
      throw caught;
    } finally {
      lock.release();
    }
  }

  if (handled === 0) {
    console.log(`no funded jobs for managed agents: ${workerAccounts.map(({ account }) => account.address).join(", ")}`);
  }

  writeStatus({
    queue: {
      pending,
      locked: listActiveLocks(lockDir),
      submitted: handled,
      skipped,
      failed
    },
    metrics: {
      ticks: (statusBeforeTick.metrics?.ticks ?? 0) + 1,
      jobsScanned: (statusBeforeTick.metrics?.jobsScanned ?? 0) + scanned,
      jobsSubmitted: (statusBeforeTick.metrics?.jobsSubmitted ?? 0) + handled,
      jobsSkipped: (statusBeforeTick.metrics?.jobsSkipped ?? 0) + skipped,
      errors: (statusBeforeTick.metrics?.errors ?? 0) + failed
    }
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

loadLocalEnv();

const rpcUrl = process.env.NEXT_PUBLIC_ARC_RPC_URL ?? defaultRpcUrl;
const explorerUrl = process.env.NEXT_PUBLIC_ARC_EXPLORER_URL ?? defaultExplorerUrl;
const escrowAddress = optionalAddress("NEXT_PUBLIC_ERC8183_ESCROW_ADDRESS", defaultEscrowAddress);
optionalAddress("NEXT_PUBLIC_ERC8004_REGISTRY_ADDRESS", defaultRegistryAddress);
const dryRun = getBooleanEnv("ARC_AGENT_DRY_RUN", true);
const once = getBooleanEnv("ARC_AGENT_ONCE", false);
const pollIntervalMs = getPositiveIntegerEnv("ARC_AGENT_POLL_INTERVAL_MS", 15_000);
const maxJobsPerTick = getPositiveIntegerEnv("ARC_AGENT_MAX_JOBS_PER_TICK", 5);
const staleLockMs = getPositiveIntegerEnv("ARC_AGENT_STALE_LOCK_MS", 10 * 60_000);
const openAiApiKey = process.env.OPENAI_API_KEY;
const openAiModel = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";
const openAiBaseUrl = process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";
const openAiTimeoutMs = getOptionalPositiveIntegerEnv("OPENAI_TIMEOUT_MS", 60_000);
const openAiMaxOutputTokens = getOptionalPositiveIntegerEnv("OPENAI_MAX_OUTPUT_TOKENS", 900);
const openAiWebSearchEnabled = getBooleanEnv("ARC_AGENT_ENABLE_WEB_SEARCH", false);
const openAiWebSearchContext = getOpenAiSearchContext();
const maxJobPayloadChars = getOptionalPositiveIntegerEnv("ARC_AGENT_MAX_JOB_PAYLOAD_CHARS", defaultMaxJobPayloadChars);

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

const escrowAbi = readAbi("ERC8183Escrow.json");
const publicClient = createPublicClient({
  chain: arcTestnet,
  transport: http(rpcUrl)
});
const workerAccounts = parsePrivateKeys().map((privateKey) => {
  const account = privateKeyToAccount(privateKey);
  return {
    account,
    walletClient: createWalletClient({
      account,
      chain: arcTestnet,
      transport: http(rpcUrl)
    })
  };
});
const outputDir = ensureOutputDir();
const { lockDir, statusPath } = ensureRuntimeDirs();

console.log(`ArcTask agent worker`);
console.log(`accounts: ${workerAccounts.map(({ account }) => account.address).join(", ")}`);
console.log(`escrow: ${escrowAddress}`);
console.log(`mode: ${dryRun ? "dry-run" : "live"}`);
console.log(`executor: ${openAiApiKey ? `openai:${openAiModel}` : "deterministic-fallback"}`);
console.log(`status: ${path.relative(rootDir, statusPath)}`);

if (
  !process.env.ARC_AGENT_PRIVATE_KEY &&
  !process.env.ARC_AGENT_PRIVATE_KEYS &&
  getBooleanEnv("ARC_AGENT_ALLOW_DEPLOYER_FALLBACK", false) &&
  process.env.ARC_TESTNET_DEPLOYER_PRIVATE_KEY
) {
  console.log("warning: using ARC_TESTNET_DEPLOYER_PRIVATE_KEY fallback because ARC_AGENT_ALLOW_DEPLOYER_FALLBACK=true.");
}

atomicWriteJson(statusPath, createInitialStatus());

do {
  try {
    await scanOnce({ dryRun, maxJobsPerTick, outputDir, lockDir });
  } catch (caught) {
    const previous = readJsonFile(statusPath, createInitialStatus());
    writeStatus({
      metrics: {
        errors: (previous.metrics?.errors ?? 0) + 1
      },
      lastError: caught instanceof Error ? caught.message : "unknown worker error"
    });
    if (once) {
      throw caught;
    }

    const message = caught instanceof Error ? caught.message : "unknown worker error";
    console.error(`worker tick failed: ${message}`);
  }

  if (once) {
    break;
  }

  await sleep(pollIntervalMs);
} while (true);
