"use client";

import { keccak256, stringToHex } from "viem";
import { createId, createMockTxHash, getArcscanTxUrl } from "@/lib/arc";
import { seedState } from "@/lib/mock-data";
import type { Address, Agent, ArcTaskState, DashboardMetrics, Job, JobStatus, TxRecord } from "@/lib/types";
import { normalizeAddress } from "@/lib/utils";

const STORAGE_KEY = "arctask.mock.v1";
let cachedState: ArcTaskState | null = null;

function createTx(
  action: TxRecord["action"],
  label: string,
  details: Pick<TxRecord, "contractLabel" | "method" | "actor" | "summary"> = {}
): TxRecord {
  const txHash = createMockTxHash();

  return {
    id: createId("tx"),
    action,
    label,
    txHash,
    arcscanUrl: getArcscanTxUrl(txHash),
    createdAt: new Date().toISOString(),
    blockNumber: 5_042_002 + Math.floor(Math.random() * 85_000),
    gasUsed: `${(18_000 + Math.floor(Math.random() * 52_000)).toLocaleString()} gas`,
    ...details
  };
}

function cloneState(state: ArcTaskState): ArcTaskState {
  return JSON.parse(JSON.stringify(state)) as ArcTaskState;
}

function isStateLike(value: unknown): value is ArcTaskState {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<ArcTaskState>;
  return Array.isArray(candidate.agents) && Array.isArray(candidate.jobs);
}

function getFreshSeedState() {
  return cloneState(seedState);
}

function readState(): ArcTaskState {
  if (typeof window === "undefined") {
    return getFreshSeedState();
  }

  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (!saved) {
    const freshState = getFreshSeedState();
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(freshState));
    cachedState = freshState;
    return freshState;
  }

  try {
    const parsed = JSON.parse(saved);
    if (!isStateLike(parsed)) {
      throw new Error("Invalid ArcTask local state.");
    }

    cachedState = parsed;
    return parsed;
  } catch {
    const freshState = getFreshSeedState();
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(freshState));
    cachedState = freshState;
    return freshState;
  }
}

function writeState(state: ArcTaskState) {
  cachedState = state;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  window.dispatchEvent(new Event("arctask:state"));
}

export function getState() {
  if (typeof window === "undefined") {
    return getFreshSeedState();
  }

  return cachedState ?? readState();
}

export function resetMockState() {
  const freshState = getFreshSeedState();
  cachedState = freshState;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(freshState));
  window.dispatchEvent(new Event("arctask:state"));
}

export function subscribeToState(callback: () => void) {
  const handleUpdate = () => {
    cachedState = null;
    callback();
  };

  window.addEventListener("storage", handleUpdate);
  window.addEventListener("arctask:state", handleUpdate);

  return () => {
    window.removeEventListener("storage", handleUpdate);
    window.removeEventListener("arctask:state", handleUpdate);
  };
}

export function registerAgent(input: {
  name: string;
  description: string;
  capabilities: string[];
  ownerWallet: Address;
  metadataUri: string;
}) {
  const state = readState();
  const ownerWallet = normalizeAddress(input.ownerWallet);
  const capabilities = input.capabilities.map((capability) => capability.trim()).filter(Boolean);

  if (!input.name.trim() || !input.description.trim()) {
    throw new Error("Name and description are required.");
  }

  if (capabilities.length === 0) {
    throw new Error("Add at least one agent capability.");
  }

  // TODO(onchain ERC-8004): replace this mock write with registry.write.registerAgent(owner, metadataURI).
  const tx = createTx("AGENT_REGISTERED", "ERC-8004 style agent identity registered", {
    actor: ownerWallet,
    contractLabel: "ERC-8004 Registry",
    method: "registerAgent(address,string)",
    summary: `${input.name} identity metadata anchored for reputation discovery.`
  });
  const agent: Agent = {
    id: createId("agent"),
    name: input.name.trim(),
    description: input.description.trim(),
    capabilities,
    ownerWallet,
    metadataUri: input.metadataUri.trim(),
    reputation: 50,
    completedJobs: 0,
    rejectedJobs: 0,
    totalEarned: 0,
    createdAt: new Date().toISOString(),
    txHistory: [tx]
  };

  writeState({
    ...state,
    agents: [agent, ...state.agents]
  });

  return { agent, tx };
}

export function createJob(input: {
  title: string;
  description: string;
  agentId: string;
  clientWallet: Address;
  evaluatorWallet: Address;
  rewardAmount: number;
  deadline: string;
}) {
  const state = readState();
  const agent = state.agents.find((item) => item.id === input.agentId);
  const clientWallet = normalizeAddress(input.clientWallet);
  const evaluatorWallet = normalizeAddress(input.evaluatorWallet);
  const rewardAmount = Number(input.rewardAmount);
  const deadlineDate = Date.parse(`${input.deadline}T00:00:00Z`);

  if (!input.title.trim() || !input.description.trim()) {
    throw new Error("Title and description are required.");
  }

  if (!agent) {
    throw new Error("Selected agent does not exist.");
  }

  if (!Number.isFinite(rewardAmount) || rewardAmount <= 0) {
    throw new Error("Reward must be greater than zero.");
  }

  if (!Number.isFinite(deadlineDate)) {
    throw new Error("Deadline must be a valid date.");
  }

  // TODO(onchain ERC-8183): replace this mock write with escrow.createJob plus USDC allowance handling.
  const tx = createTx("JOB_FUNDED", "ERC-8183 style escrow funded with testnet USDC", {
    actor: clientWallet,
    contractLabel: "ERC-8183 Escrow",
    method: "createJob(uint256,uint256,uint64,address)",
    summary: `${rewardAmount} USDC locked for evaluator-controlled settlement.`
  });
  const now = new Date().toISOString();
  const job: Job = {
    id: createId("job"),
    title: input.title.trim(),
    description: input.description.trim(),
    agentId: agent.id,
    clientWallet,
    evaluatorWallet,
    rewardAmount,
    deadline: input.deadline,
    status: "FUNDED",
    createdAt: now,
    updatedAt: now,
    txHistory: [tx]
  };

  writeState({
    ...state,
    jobs: [job, ...state.jobs]
  });

  return { job, tx };
}

export function submitDeliverable(jobId: string, deliverableContent: string) {
  const state = readState();
  const job = state.jobs.find((item) => item.id === jobId);
  if (!job || job.status !== "FUNDED") {
    throw new Error("Only funded jobs can receive a deliverable.");
  }

  const agent = state.agents.find((item) => item.id === job.agentId);
  if (!agent) {
    throw new Error("Job agent does not exist.");
  }

  const deliverable = deliverableContent.trim();
  if (!deliverable) {
    throw new Error("Deliverable content is required.");
  }

  const deliverableHash = keccak256(stringToHex(deliverable));
  // TODO(onchain ERC-8183): replace this mock write with escrow.submitDeliverable(jobId, deliverableHash).
  const tx = createTx("DELIVERABLE_SUBMITTED", "Deliverable hash submitted", {
    actor: agent.ownerWallet,
    contractLabel: "ERC-8183 Escrow",
    method: "submitDeliverable(uint256,bytes32)",
    summary: `Keccak deliverable hash ${deliverableHash.slice(0, 10)}... recorded for evaluator review.`
  });
  const updatedJobs = state.jobs.map((job) =>
    job.id === jobId
      ? {
          ...job,
          status: "SUBMITTED" as JobStatus,
          deliverableContent: deliverable,
          deliverableHash,
          updatedAt: new Date().toISOString(),
          txHistory: [tx, ...job.txHistory]
        }
      : job
  );

  const updatedAgents = state.agents.map((item) =>
    item.id === agent.id
      ? {
          ...item,
          txHistory: [tx, ...item.txHistory]
        }
      : item
  );

  writeState({ agents: updatedAgents, jobs: updatedJobs });
  return { tx, deliverableHash };
}

export function acceptWork(jobId: string) {
  const state = readState();
  const job = state.jobs.find((item) => item.id === jobId);
  if (!job || job.status !== "SUBMITTED") {
    throw new Error("Only submitted jobs can be accepted.");
  }

  // TODO(onchain ERC-8183): replace this mock write with escrow.acceptWork(jobId).
  const tx = createTx("WORK_ACCEPTED", "Escrow settled to agent", {
    actor: job.evaluatorWallet,
    contractLabel: "ERC-8183 Escrow",
    method: "acceptWork(uint256)",
    summary: `${job.rewardAmount} USDC released and agent reputation increased.`
  });
  const updatedJobs = state.jobs.map((item) =>
    item.id === jobId
      ? {
          ...item,
          status: "ACCEPTED" as JobStatus,
          updatedAt: new Date().toISOString(),
          txHistory: [tx, ...item.txHistory]
        }
      : item
  );
  const updatedAgents = state.agents.map((agent) =>
    agent.id === job.agentId
      ? {
          ...agent,
          completedJobs: agent.completedJobs + 1,
          reputation: Math.min(100, agent.reputation + 8),
          totalEarned: agent.totalEarned + job.rewardAmount,
          txHistory: [tx, ...agent.txHistory]
        }
      : agent
  );

  writeState({ agents: updatedAgents, jobs: updatedJobs });
  return { tx };
}

export function rejectWork(jobId: string) {
  const state = readState();
  const job = state.jobs.find((item) => item.id === jobId);
  if (!job || job.status !== "SUBMITTED") {
    throw new Error("Only submitted jobs can be rejected.");
  }

  // TODO(onchain ERC-8183): replace this mock write with escrow.rejectWork(jobId).
  const tx = createTx("WORK_REJECTED", "Evaluator rejected deliverable", {
    actor: job.evaluatorWallet,
    contractLabel: "ERC-8183 Escrow",
    method: "rejectWork(uint256)",
    summary: "Deliverable rejected and a negative reputation event recorded."
  });
  const updatedJobs = state.jobs.map((item) =>
    item.id === jobId
      ? {
          ...item,
          status: "REJECTED" as JobStatus,
          updatedAt: new Date().toISOString(),
          txHistory: [tx, ...item.txHistory]
        }
      : item
  );
  const updatedAgents = state.agents.map((agent) =>
    agent.id === job.agentId
      ? {
          ...agent,
          rejectedJobs: agent.rejectedJobs + 1,
          reputation: Math.max(0, agent.reputation - 6),
          txHistory: [tx, ...agent.txHistory]
        }
      : agent
  );

  writeState({ agents: updatedAgents, jobs: updatedJobs });
  return { tx };
}

export function refundJob(jobId: string) {
  const state = readState();
  const job = state.jobs.find((item) => item.id === jobId);
  if (!job || !["FUNDED", "SUBMITTED"].includes(job.status)) {
    throw new Error("Only active jobs can be refunded.");
  }

  // TODO(onchain ERC-8183): replace this mock write with escrow.refundExpired(jobId).
  const tx = createTx("JOB_REFUNDED", "Expired escrow refunded to client", {
    actor: job.clientWallet,
    contractLabel: "ERC-8183 Escrow",
    method: "refund(uint256)",
    summary: `${job.rewardAmount} USDC returned to client after escrow closeout.`
  });
  const updatedJobs = state.jobs.map((item) =>
    item.id === jobId
      ? {
          ...item,
          status: "REFUNDED" as JobStatus,
          updatedAt: new Date().toISOString(),
          txHistory: [tx, ...item.txHistory]
        }
      : item
  );

  writeState({ ...state, jobs: updatedJobs });
  return { tx };
}

export function getMetrics(state: ArcTaskState): DashboardMetrics {
  const txs = [
    ...state.agents.flatMap((agent) => agent.txHistory),
    ...state.jobs.flatMap((job) => job.txHistory)
  ];

  return {
    totalAgents: state.agents.length,
    totalJobs: state.jobs.length,
    totalEscrowed: state.jobs
      .filter((job) => job.status === "FUNDED" || job.status === "SUBMITTED")
      .reduce((sum, job) => sum + job.rewardAmount, 0),
    totalCompletedJobs: state.jobs.filter((job) => job.status === "ACCEPTED").length,
    totalReputationEvents: state.agents.reduce(
      (sum, agent) => sum + agent.completedJobs + agent.rejectedJobs,
      0
    ),
    totalTxs: txs.length
  };
}
