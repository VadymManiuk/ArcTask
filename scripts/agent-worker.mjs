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
import {
  appendSourceUrls,
  assertAgentResultQuality,
  collectOpenAiSourceUrls
} from "./agent-result-quality.mjs";
import { loadTaskArtifacts } from "./agent-task-context.mjs";
import { collectWalletRiskEvidence } from "./agent-wallet-evidence.mjs";
import { waitForTransactionReceiptWithRetry, withRpcRetry } from "./arc-rpc.mjs";
import { createExecutionPlan } from "../lib/execution-routing.mjs";
import {
  allocateAttemptTimeout,
  describeOpenAiResponse,
  lowerReasoningEffort,
  requestBackgroundResponse
} from "../lib/openai-background.mjs";

const rootDir = process.cwd();
const defaultRegistryAddress = "0xd8499627775ac67cd756335a3c48387d0aff5553";
const defaultEscrowAddress = "0x08eb8630f6b5d2c1c030688076b80360531a2e9a";
const defaultRpcUrl = "https://rpc.testnet.arc.network";
const defaultExplorerUrl = "https://testnet.arcscan.app";
const fundedStatus = 0;
const statusVersion = 1;
const defaultMaxJobPayloadChars = 8_000;

class InsufficientComputeBudgetError extends Error {
  constructor(executionPlan) {
    super(
      `INSUFFICIENT_COMPUTE_BUDGET: ${executionPlan.complexity.score}/100 complexity requires ${executionPlan.requiredTier} tier and at least ${executionPlan.minimumRecommendedReward} USDC; funded with ${executionPlan.rewardAmount} USDC.`
    );
    this.name = "InsufficientComputeBudgetError";
    this.executionPlan = executionPlan;
  }
}

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
  const value = (process.env.ARC_AGENT_WEB_SEARCH_CONTEXT ?? "medium").toLowerCase();
  if (["low", "medium", "high"].includes(value)) {
    return value;
  }

  throw new Error("ARC_AGENT_WEB_SEARCH_CONTEXT must be low, medium, or high.");
}

function getRoutingMode() {
  const value = (process.env.ARC_AGENT_ROUTING_MODE ?? "enforce").toLowerCase();
  if (["off", "shadow", "enforce"].includes(value)) {
    return value;
  }

  throw new Error("ARC_AGENT_ROUTING_MODE must be off, shadow, or enforce.");
}

function getJobIdSetEnv(name) {
  const jobIds = (process.env[name] ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  for (const jobId of jobIds) {
    if (!/^\d+$/.test(jobId) || BigInt(jobId) <= 0n) {
      throw new Error(`${name} must contain only positive comma-separated job IDs.`);
    }
  }

  return new Set(jobIds.map((jobId) => BigInt(jobId).toString()));
}

function getReasoningEffort() {
  const value = (process.env.OPENAI_REASONING_EFFORT ?? "medium").toLowerCase();
  if (["low", "medium", "high", "xhigh"].includes(value)) {
    return value;
  }

  throw new Error("OPENAI_REASONING_EFFORT must be low, medium, high, or xhigh.");
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
  const executionPlan = buildExecutionPlan(jobId, job, payload);
  if (executionPlan.budgetDecision === "insufficient") {
    throw new InsufficientComputeBudgetError(executionPlan);
  }

  const result = await buildAgentResult(jobId, job, payload, executionPlan);
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
    executionPlan,
    result
  };
  const content = serializeBigInts(report);
  return {
    content,
    hash: keccak256(stringToHex(content)),
    report
  };
}

function buildExecutionPlan(jobId, job, payload) {
  const plan = createExecutionPlan(
    {
      title: payload?.title,
      description: payload?.description,
      rewardAmount: Number(formatUnits(job.rewardAmount, 18))
    },
    {
      allowSubsidy: routingSubsidyEnabled || recoveryJobIds.has(jobId.toString())
    }
  );

  if (routingMode === "off") {
    return {
      ...plan,
      selectedTier: "fixed",
      budgetDecision: "sufficient",
      model: openAiModel,
      reasoningEffort: openAiReasoningEffort,
      reasoningMode: null,
      maxRuntimeMs: openAiTimeoutMs,
      requestTimeoutMs: openAiTimeoutMs,
      maxOutputTokens: openAiMaxOutputTokens,
      maxAttempts: 1,
      validationPasses: 0
    };
  }

  if (routingMode === "shadow") {
    return {
      ...plan,
      shadowRecommendation: {
        model: plan.model,
        reasoningEffort: plan.reasoningEffort,
        maxRuntimeMs: plan.maxRuntimeMs,
        maxOutputTokens: plan.maxOutputTokens
      },
      selectedTier: "fixed-shadow",
      budgetDecision: "sufficient",
      model: openAiModel,
      reasoningEffort: openAiReasoningEffort,
      reasoningMode: null,
      maxRuntimeMs: openAiTimeoutMs,
      requestTimeoutMs: openAiTimeoutMs,
      maxOutputTokens: openAiMaxOutputTokens,
      maxAttempts: 1,
      validationPasses: 0
    };
  }

  return {
    ...plan,
    maxRuntimeMs: Math.min(plan.maxRuntimeMs, routingMaxRuntimeMs),
    requestTimeoutMs: Math.min(plan.requestTimeoutMs, routingMaxRuntimeMs),
    maxOutputTokens: Math.min(plan.maxOutputTokens, routingMaxOutputTokens)
  };
}

async function buildAgentResult(jobId, job, payload, executionPlan) {
  if (!openAiApiKey) {
    if (allowDeterministicFallback) {
      return buildFallbackAgentResult(jobId, payload, "OPENAI_API_KEY is not configured.");
    }

    throw new Error("OPENAI_API_KEY is required because deterministic fallback submissions are disabled.");
  }

  try {
    return await runOpenAiExecutor(jobId, job, payload, executionPlan);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "OpenAI executor failed.";
    if (allowDeterministicFallback) {
      return {
        ...buildFallbackAgentResult(jobId, payload, message),
        aiError: message
      };
    }

    throw new Error(`Deliverable generation failed; job will remain funded: ${message}`, { cause: caught });
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

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function getPayloadText(payload) {
  return [payload?.title, payload?.description].map(normalizeText).filter(Boolean).join("\n\n");
}

function extractPayloadField(text, label) {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(new RegExp(`^\\s*${escapedLabel}\\s*:\\s*(.+)$`, "im"));
  return match?.[1]?.trim();
}

function extractWallet(text) {
  return text.match(/0x[a-fA-F0-9]{40}/)?.[0];
}

function looksLikePaymentReview(payload) {
  const text = getPayloadText(payload).toLowerCase();
  return (
    (text.includes("payment") || text.includes("invoice") || text.includes("treasury")) &&
    (text.includes("usdc") || text.includes("wallet") || text.includes("recipient"))
  );
}

function getTaskProfile(payload) {
  const text = getPayloadText(payload).toLowerCase();
  if (looksLikePaymentReview(payload)) {
    return {
      kind: "treasury_payment_review",
      instruction:
        "For treasury payment reviews, check amount reasonableness, invoice completeness, recipient wallet completeness, wallet ownership proof, delivery proof, missing approvals, operational risks, recommendation, required next steps, and confidence score."
    };
  }

  if (
    text.includes("compliance") ||
    text.includes("governance") ||
    text.includes("policy") ||
    text.includes("role separation") ||
    text.includes("control assessment")
  ) {
    return {
      kind: "governance_compliance",
      instruction:
        "For governance and compliance work, define the scope and applicable assumptions, map roles and controls, identify missing evidence and conflicts of interest, rank gaps by impact, and provide concrete remediation and verification steps. Do not present legal conclusions without supplied jurisdiction and policy sources."
    };
  }

  if (text.includes("contract") || text.includes("solidity") || text.includes("smart contract") || text.includes("audit")) {
    return {
      kind: "contract_review",
      instruction:
        "Review the supplied Solidity source and ABI directly. Required sections: Scope, Authorization matrix, State-transition invariants, Settlement and refund invariants, Reentrancy and external-call analysis, Severity-ranked findings, Recommended tests, and Deployment recommendation. Reference concrete functions and distinguish confirmed code findings from trust or deployment assumptions. Never use payment-review headings."
    };
  }

  if (
    text.includes("devops") ||
    text.includes("deployment") ||
    text.includes("incident") ||
    text.includes("monitoring") ||
    text.includes("observability") ||
    text.includes("rpc reliability") ||
    text.includes("production readiness")
  ) {
    return {
      kind: "devops_reliability",
      instruction:
        "For DevOps and reliability tasks, review architecture, deployment safety, secrets, monitoring, alerts, rollback, retries, rate limits, incident response, and operational ownership. Produce severity-ranked risks, concrete checks, and a production-readiness decision."
    };
  }

  if (
    text.includes("integration") ||
    text.includes("api") ||
    text.includes("indexer") ||
    text.includes("sdk") ||
    text.includes("webhook") ||
    text.includes("cross-chain")
  ) {
    return {
      kind: "protocol_integration",
      instruction:
        "For integration engineering tasks, define systems and data flow, authentication and trust boundaries, interfaces, validation, retries and idempotency, failure handling, testing, rollout, and acceptance criteria. Return implementation-ready steps and clearly flag missing technical inputs."
    };
  }

  if (
    text.includes("tge") ||
    text.includes("token") ||
    text.includes("market") ||
    text.includes("research") ||
    text.includes("find") ||
    text.includes("sources")
  ) {
    return {
      kind: "market_research",
      instruction:
        "For research tasks, identify candidates or facts, cite source URLs, separate confirmed facts from unconfirmed signals, summarize risks, and give a concise recommendation. Use web search when available."
    };
  }

  if (text.includes("ui") || text.includes("ux") || text.includes("design") || text.includes("frontend") || text.includes("product")) {
    return {
      kind: "product_review",
      instruction:
        "For product or UI reviews, evaluate clarity, workflow, visual hierarchy, missing states, user risks, and give prioritized fixes with a final ship or revise recommendation."
    };
  }

  if (text.includes("doc") || text.includes("readme") || text.includes("spec") || text.includes("write")) {
    return {
      kind: "documentation_task",
      instruction:
        "For documentation tasks, produce clear structured content, assumptions, missing inputs, and ready-to-use copy without unnecessary meta commentary."
    };
  }

  if (text.includes("wallet") || text.includes("risk") || text.includes("counterparty")) {
    return {
      kind: "wallet_or_counterparty_risk",
      instruction:
        "For wallet or counterparty risk tasks, use the verified Arc RPC and Arcscan evidence snapshot. Required sections: Decision, Verified onchain facts, Recent transaction sample, Ownership and role evidence, Severity-ranked findings, Evidence limitations, Required onboarding controls, and Recommendation. Distinguish confirmed facts, risk indicators, and evidence gaps. Do not claim that the network, balance, nonce, bytecode, account type, or transaction history is unavailable when the evidence contains it. Arc Testnet native USDC uses 18 decimals; do not misclassify correct native-USDC formatting as an unresolved ERC-20 decimal issue."
    };
  }

  return {
    kind: "general_task",
    instruction:
      "For general tasks, infer the expected deliverable from the payload, make useful assumptions explicit, provide a concrete result, list missing information, and give next steps."
  };
}

function buildPaymentReviewSummary(payload) {
  const text = getPayloadText(payload);
  const vendor = extractPayloadField(text, "Vendor") ?? "the vendor";
  const service = extractPayloadField(text, "Service") ?? "the requested service";
  const amount = extractPayloadField(text, "Requested amount") ?? extractPayloadField(text, "Amount") ?? "the requested amount";
  const wallet = extractPayloadField(text, "Recipient wallet") ?? extractWallet(text) ?? "not provided";
  const invoiceNote = extractPayloadField(text, "Invoice note");
  const paymentDate = extractPayloadField(text, "Requested payment date");

  return [
    `Treasury Payment Review: ${vendor}`,
    "",
    "Payment summary:",
    `The request asks the treasury to pay ${amount} to ${vendor} for ${service}.` +
      (invoiceNote ? ` The invoice note says: ${invoiceNote}` : "") +
      (paymentDate ? ` Requested payment date: ${paymentDate}.` : ""),
    "",
    "Invoice completeness check:",
    "The request includes a vendor name, service description, requested amount, recipient wallet, and payment context.",
    "It is still missing several approval details:",
    "1. invoice number or formal payment request",
    "2. link to completed work, deployment, or GitHub pull request",
    "3. confirmation that the recipient wallet belongs to the vendor",
    "4. written approval from the project owner or evaluator",
    "5. payment terms, milestone status, or acceptance note",
    "",
    "Recipient wallet risk notes:",
    `The recipient wallet is ${wallet}.`,
    wallet === "not provided"
      ? "This is incomplete. A valid recipient wallet is required before settlement."
      : "The wallet is present and formatted like an EVM address, but ownership is not proven by the supplied payload.",
    "Before releasing funds, verify wallet ownership through a signed message, prior payment history, vendor profile, or direct written confirmation.",
    "",
    "Amount reasonableness:",
    `${amount} appears reasonable for a small UI, landing page, or demo polish task if the work was actually delivered. The amount does not look excessive from the supplied scope alone.`,
    "",
    "Approval risks:",
    "The main risk is operational: paying the wrong wallet or paying before delivery is confirmed. There is not enough evidence in the payload to safely approve the transfer yet.",
    "",
    "Recommendation:",
    "Request more information before settlement.",
    "",
    "Required next steps:",
    "1. Ask for a link to the completed work",
    "2. Ask for invoice number or written payment request",
    "3. Confirm the recipient wallet belongs to the vendor",
    "4. Verify that the ArcTask owner or evaluator approved the work",
    "5. Approve payment only after these checks are complete",
    "",
    "Confidence score:",
    "7/10",
    "",
    "Final decision:",
    `Request more info before releasing ${amount}.`
  ].join("\n");
}

async function requestOpenAiResponse({ requestBody, timeoutMs, onProgress }) {
  return requestBackgroundResponse({
    apiKey: openAiApiKey,
    baseUrl: openAiBaseUrl,
    requestBody,
    timeoutMs,
    httpTimeoutMs: openAiHttpTimeoutMs,
    pollIntervalMs: openAiPollIntervalMs,
    onProgress
  });
}

function mergeUsage(current, body) {
  const usage = body?.usage ?? {};
  return {
    inputTokens: current.inputTokens + Number(usage.input_tokens ?? 0),
    outputTokens: current.outputTokens + Number(usage.output_tokens ?? 0),
    totalTokens: current.totalTokens + Number(usage.total_tokens ?? 0)
  };
}

async function runOpenAiExecutor(jobId, job, payload, executionPlan) {
  const startedAt = Date.now();
  const taskProfile = getTaskProfile(payload);
  const tools =
    openAiWebSearchEnabled && taskProfile.kind === "market_research"
      ? [{ type: "web_search", search_context_size: executionPlan.webSearchContext }]
      : undefined;
  const evidence =
    taskProfile.kind === "wallet_or_counterparty_risk"
      ? await collectWalletRiskEvidence({
          payload,
          publicClient,
          rpcUrl,
          explorerUrl
        })
      : undefined;
  const task = {
    jobId: jobId.toString(),
    taskProfile: taskProfile.kind,
    payload,
    artifacts: loadTaskArtifacts({
      taskKind: taskProfile.kind,
      rootDir,
      escrowAddress,
      registryAddress
    }),
    evidence,
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

  const systemInstructions = [
    "You are an autonomous ArcTask AI agent. Complete the requested task from the supplied onchain payload and verified artifacts.",
    `Task profile: ${taskProfile.kind}. ${taskProfile.instruction}`,
    taskProfile.kind === "market_research"
      ? `Use web search. Cite at least ${executionPlan.minimumSources} primary source URLs, separate verified facts from uncertain signals, and include a concise opportunity and risk comparison.`
      : taskProfile.kind === "contract_review"
        ? "Use the supplied contract source and ABI as primary evidence. Do not claim that source code, ABI, or deployed addresses are missing."
        : taskProfile.kind === "wallet_or_counterparty_risk"
          ? "Treat task.evidence as the verified wallet-specific evidence set. Analyze the recent transaction sample instead of replacing it with a generic checklist. Do not interpret an absent explorer scam label as sanctions or AML clearance. Keep the report decision-ready and omit controls unrelated to the observed evidence."
        : "Use the supplied payload as primary evidence and clearly identify any input that is genuinely absent.",
    "Return only the complete evaluator-ready deliverable. Do not include hidden reasoning, markdown code fences, generic filler, or an unfinished section."
  ].join(" ");
  let summary = "";
  let sourceUrls = [];
  let attemptsUsed = 0;
  let validationPassesCompleted = 0;
  const validationWarnings = [];
  let usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  let lastError;

  for (let attempt = 1; attempt <= executionPlan.maxAttempts; attempt += 1) {
    attemptsUsed = attempt;
    const remainingMs = executionPlan.maxRuntimeMs - (Date.now() - startedAt);
    if (remainingMs <= 1_000) {
      throw new Error(`Execution exceeded the ${executionPlan.maxRuntimeMs}ms runtime budget.`);
    }

    try {
      const attemptsLeft = executionPlan.maxAttempts - attempt + 1;
      const attemptTimeoutMs = allocateAttemptTimeout({
        remainingMs,
        requestTimeoutMs: executionPlan.requestTimeoutMs,
        attemptsLeft
      });
      const attemptReasoning = {
        effort: lowerReasoningEffort(executionPlan.reasoningEffort, attempt - 1),
        ...(attempt === 1 && executionPlan.reasoningMode ? { mode: executionPlan.reasoningMode } : {})
      };
      const body = await requestOpenAiResponse({
        timeoutMs: attemptTimeoutMs,
        onProgress: ({ id, status, elapsedMs }) =>
          writeStatus({
            activeJob: {
              jobId: jobId.toString(),
              phase: "generation",
              attempt,
              status,
              responseId: id,
              elapsedMs,
              startedAt: new Date(startedAt).toISOString()
            }
          }),
        requestBody: {
          model: executionPlan.model,
          reasoning: attemptReasoning,
          max_output_tokens: executionPlan.maxOutputTokens,
          ...(tools ? { tools } : {}),
          input: [
            {
              role: "system",
              content: [{ type: "input_text", text: systemInstructions }]
            },
            {
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: [
                    JSON.stringify(task, null, 2),
                    attempt > 1
                      ? `\nPrevious attempt failed validation: ${lastError?.message ?? "unknown quality failure"}. Produce a corrected complete deliverable.`
                      : ""
                  ].join("")
                }
              ]
            }
          ]
        }
      });
      usage = mergeUsage(usage, body);
      const output = extractOpenAiText(body);
      if (!output) {
        throw new Error(`${describeOpenAiResponse(body)} No deliverable text was returned.`);
      }

      sourceUrls = uniq([...sourceUrls, ...collectOpenAiSourceUrls(body, output)]);
      summary = appendSourceUrls(output, sourceUrls);
      assertAgentResultQuality({
        taskKind: taskProfile.kind,
        summary,
        sourceUrls,
        minimumSources: executionPlan.minimumSources,
        evidence
      });
      lastError = undefined;
      break;
    } catch (caught) {
      lastError = caught instanceof Error ? caught : new Error("OpenAI execution failed.");
    }
  }

  if (lastError || !summary) {
    throw lastError ?? new Error("OpenAI execution failed to produce a valid deliverable.");
  }

  for (let pass = 1; pass <= executionPlan.validationPasses; pass += 1) {
    const remainingMs = executionPlan.maxRuntimeMs - (Date.now() - startedAt);
    if (remainingMs <= 1_000) {
      break;
    }

    try {
      const body = await requestOpenAiResponse({
        timeoutMs: Math.min(executionPlan.requestTimeoutMs, remainingMs),
        onProgress: ({ id, status, elapsedMs }) =>
          writeStatus({
            activeJob: {
              jobId: jobId.toString(),
              phase: "validation",
              attempt: pass,
              status,
              responseId: id,
              elapsedMs,
              startedAt: new Date(startedAt).toISOString()
            }
          }),
        requestBody: {
          model: executionPlan.model,
          reasoning: {
            effort: lowerReasoningEffort(executionPlan.reasoningEffort)
          },
          max_output_tokens: executionPlan.maxOutputTokens,
          input: [
            {
              role: "system",
              content: [
                {
                  type: "input_text",
                  text:
                    "Act as a strict evaluator and editor. Check the draft against the original ArcTask, remove unsupported claims, repair omissions, preserve valid source URLs, and return only the complete improved deliverable."
                }
              ]
            },
            {
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: JSON.stringify(
                    {
                      task,
                      taskProfile: taskProfile.kind,
                      requiredMinimumSources: executionPlan.minimumSources,
                      draft: summary
                    },
                    null,
                    2
                  )
                }
              ]
            }
          ]
        }
      });
      usage = mergeUsage(usage, body);
      const revisedOutput = extractOpenAiText(body);
      if (!revisedOutput) {
        throw new Error(`${describeOpenAiResponse(body)} Validation returned no deliverable text.`);
      }

      const revisedSourceUrls = uniq([...sourceUrls, ...collectOpenAiSourceUrls(body, revisedOutput)]);
      const revisedSummary = appendSourceUrls(revisedOutput, revisedSourceUrls);
      assertAgentResultQuality({
        taskKind: taskProfile.kind,
        summary: revisedSummary,
        sourceUrls: revisedSourceUrls,
        minimumSources: executionPlan.minimumSources,
        evidence
      });
      summary = revisedSummary;
      sourceUrls = revisedSourceUrls;
      validationPassesCompleted = pass;
    } catch (caught) {
      validationWarnings.push(caught instanceof Error ? caught.message : "Validation pass failed.");
      break;
    }
  }

  return {
    status: "completed",
    mode: "openai",
    model: executionPlan.model,
    title: payload?.title ?? `ArcTask job ${jobId.toString()}`,
    summary,
    sourceUrls,
    execution: {
      tier: executionPlan.selectedTier,
      reasoningEffort: executionPlan.reasoningEffort,
      reasoningMode: executionPlan.reasoningMode,
      attemptsUsed,
      validationPassesCompleted,
      durationMs: Date.now() - startedAt,
      usage,
      validationWarnings
    }
  };
}

function extractOpenAiText(body) {
  if (typeof body.output_text === "string") {
    return body.output_text.trim();
  }

  const chunks = [];
  for (const item of body.output ?? []) {
    if (typeof item.text === "string") {
      chunks.push(item.text);
    }

    if (typeof item.output_text === "string") {
      chunks.push(item.output_text);
    }

    for (const content of item.content ?? []) {
      if (typeof content.text === "string") {
        chunks.push(content.text);
      }
      if (typeof content.output_text === "string") {
        chunks.push(content.output_text);
      }
      if (content.type === "output_text" && typeof content.content === "string") {
        chunks.push(content.content);
      }
    }
  }

  return [...new Set(chunks.map((chunk) => chunk.trim()).filter(Boolean))].join("\n").trim();
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

  if (looksLikePaymentReview(payload)) {
    return buildPaymentReviewSummary(payload);
  }

  return [
    `Task Review: ${payload.title ?? `ArcTask job ${jobId.toString()}`}`,
    "",
    "What I could verify:",
    payload.description
      ? `The supplied payload describes this task: ${payload.description}`
      : "The payload did not include a detailed task description.",
    "",
    "Missing information:",
    "No external evidence, links, files, or evaluator notes were provided beyond the onchain job payload.",
    "",
    "Recommendation:",
    "Request more information if the evaluator needs proof beyond the supplied payload. Otherwise, review the submitted deliverable hash and decide whether it satisfies the original task.",
    "",
    "Confidence score:",
    "5/10"
  ]
    .filter(Boolean)
    .join("\n");
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
    executor: openAiApiKey
      ? routingMode === "enforce"
        ? "openai:gpt-5.6-dynamic"
        : `openai:${openAiModel}`
      : "deterministic-fallback",
    routingMode,
    routingSubsidyEnabled,
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
      underfunded: 0,
      skipped: 0,
      failed: 0
    },
    metrics: {
      ticks: 0,
      jobsScanned: 0,
      jobsSubmitted: 0,
      jobsUnderfunded: 0,
      jobsSkipped: 0,
      errors: 0
    },
    recentEvents: [],
    activeJob: null
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
  const result = await withRpcRetry(() =>
    publicClient.readContract({
      address: escrowAddress,
      abi: escrowAbi,
      functionName: "jobs",
      args: [jobId]
    })
  );

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
  const receipt = await waitForTransactionReceiptWithRetry(publicClient, txHash);
  if (receipt.status !== "success") {
    throw new Error(`submitDeliverable failed for job ${jobId}: ${txHash}`);
  }

  const filePath = writeDeliverable(outputDir, jobId, deliverable, txHash);
  console.log(`submitted job ${jobId}: ${txHash}`);
  console.log(`saved ${path.relative(rootDir, filePath)}`);
  return true;
}

async function scanOnce({ dryRun, maxJobsPerTick, outputDir, lockDir }) {
  const nextJobId = await withRpcRetry(() =>
    publicClient.readContract({
      address: escrowAddress,
      abi: escrowAbi,
      functionName: "nextJobId"
    })
  );
  let handled = 0;
  let scanned = 0;
  let skipped = 0;
  let underfunded = 0;
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
      const submitted = await submitJob(jobId, job, outputDir, dryRun, workerAccount);
      if (!submitted) {
        skipped += 1;
        appendStatusEvent({
          type: "job_skipped",
          jobId: jobId.toString(),
          worker: workerAccount.account.address,
          reason: "deadline_expired"
        });
        continue;
      }

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
      if (caught instanceof InsufficientComputeBudgetError) {
        underfunded += 1;
        skipped += 1;
        const latestStatus = readJsonFile(statusPath, createInitialStatus());
        const alreadyReported = (latestStatus.recentEvents ?? []).some(
          (event) => event.type === "job_underfunded" && event.jobId === jobId.toString()
        );
        if (!alreadyReported) {
          appendStatusEvent({
            type: "job_underfunded",
            jobId: jobId.toString(),
            worker: workerAccount.account.address,
            complexityScore: caught.executionPlan.complexity.score,
            requiredTier: caught.executionPlan.requiredTier,
            minimumRecommendedReward: caught.executionPlan.minimumRecommendedReward,
            fundedReward: caught.executionPlan.rewardAmount
          });
        }
        console.log(`defer job ${jobId}: ${caught.message}`);
        continue;
      }

      failed += 1;
      const message = caught instanceof Error ? caught.message : "unknown submit error";
      appendStatusEvent({
        type: "job_failed",
        jobId: jobId.toString(),
        worker: workerAccount.account.address,
        error: message
      });
      console.error(`job ${jobId} failed: ${message}`);
    } finally {
      try {
        writeStatus({ activeJob: null });
      } finally {
        lock.release();
      }
    }
  }

  if (handled === 0) {
    console.log(`no funded jobs for managed agents: ${workerAccounts.map(({ account }) => account.address).join(", ")}`);
  }

  writeStatus({
    lastError: failed > 0 ? statusBeforeTick.lastError : undefined,
    queue: {
      pending,
      locked: listActiveLocks(lockDir),
      submitted: handled,
      underfunded,
      skipped,
      failed
    },
    metrics: {
      ticks: (statusBeforeTick.metrics?.ticks ?? 0) + 1,
      jobsScanned: (statusBeforeTick.metrics?.jobsScanned ?? 0) + scanned,
      jobsSubmitted: (statusBeforeTick.metrics?.jobsSubmitted ?? 0) + handled,
      jobsUnderfunded: (statusBeforeTick.metrics?.jobsUnderfunded ?? 0) + underfunded,
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
const registryAddress = optionalAddress("NEXT_PUBLIC_ERC8004_REGISTRY_ADDRESS", defaultRegistryAddress);
const dryRun = getBooleanEnv("ARC_AGENT_DRY_RUN", true);
const once = getBooleanEnv("ARC_AGENT_ONCE", false);
const pollIntervalMs = getPositiveIntegerEnv("ARC_AGENT_POLL_INTERVAL_MS", 15_000);
const maxJobsPerTick = getPositiveIntegerEnv("ARC_AGENT_MAX_JOBS_PER_TICK", 5);
const staleLockMs = getPositiveIntegerEnv("ARC_AGENT_STALE_LOCK_MS", 10 * 60_000);
const openAiApiKey = process.env.OPENAI_API_KEY;
const openAiModel = process.env.OPENAI_MODEL ?? "gpt-5.6-sol";
const openAiBaseUrl = process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";
const openAiTimeoutMs = getOptionalPositiveIntegerEnv("OPENAI_TIMEOUT_MS", 180_000);
const openAiHttpTimeoutMs = getOptionalPositiveIntegerEnv("OPENAI_HTTP_TIMEOUT_MS", 30_000);
const openAiPollIntervalMs = getOptionalPositiveIntegerEnv("OPENAI_POLL_INTERVAL_MS", 3_000);
const openAiMaxOutputTokens = getOptionalPositiveIntegerEnv("OPENAI_MAX_OUTPUT_TOKENS", 3_000);
const openAiReasoningEffort = getReasoningEffort();
const openAiWebSearchEnabled = getBooleanEnv("ARC_AGENT_ENABLE_WEB_SEARCH", false);
const openAiWebSearchContext = getOpenAiSearchContext();
const allowDeterministicFallback = getBooleanEnv("ARC_AGENT_ALLOW_DETERMINISTIC_FALLBACK", dryRun);
const maxJobPayloadChars = getOptionalPositiveIntegerEnv("ARC_AGENT_MAX_JOB_PAYLOAD_CHARS", defaultMaxJobPayloadChars);
const routingMode = getRoutingMode();
const routingSubsidyEnabled = getBooleanEnv("ARC_AGENT_DEMO_SUBSIDY", false);
const recoveryJobIds = getJobIdSetEnv("ARC_AGENT_RECOVERY_JOB_IDS");
const routingMaxRuntimeMs = getOptionalPositiveIntegerEnv("ARC_AGENT_MAX_RUNTIME_MS", 900_000);
const routingMaxOutputTokens = getOptionalPositiveIntegerEnv("ARC_AGENT_MAX_OUTPUT_TOKENS", 24_000);

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
console.log(
  `executor: ${
    openAiApiKey
      ? routingMode === "enforce"
        ? "openai:gpt-5.6-dynamic"
        : `openai:${openAiModel}`
      : "deterministic-fallback"
  }`
);
console.log(`routing: ${routingMode}${routingSubsidyEnabled ? " (demo subsidy enabled)" : ""}`);
if (recoveryJobIds.size > 0) {
  console.log(`recovery jobs: ${[...recoveryJobIds].join(", ")}`);
}
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
