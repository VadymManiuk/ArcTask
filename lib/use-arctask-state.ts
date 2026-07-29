"use client";

import { useEffect, useState } from "react";
import { formatUnits } from "viem";
import { ARC_TESTNET } from "@/lib/arc";
import { getArcMode } from "@/lib/arc-config";
import { getState, hydrateNetworkState, subscribeToState } from "@/lib/store";
import { seedState } from "@/lib/mock-data";
import type { Address, Agent, ArcTaskState, Job, JobStatus } from "@/lib/types";

interface NetworkAgent {
  onchainAgentId: string;
  ownerWallet: Address;
  metadataURI: string;
  createdAt: string;
  reputation: number;
  completedJobs: number;
  rejectedJobs: number;
  totalEarned: number;
  name: string;
  description: string;
  capabilities: string[];
}

interface NetworkJob {
  onchainJobId: string;
  title: string;
  description: string;
  clientWallet: Address;
  onchainAgentId: string;
  evaluatorWallet: Address;
  rewardAmount: string;
  deadline: number;
  deliverableHash: `0x${string}`;
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
}

interface NetworkAgentsResponse {
  ok: boolean;
  agents?: NetworkAgent[];
}

interface NetworkJobsResponse {
  ok: boolean;
  jobs?: NetworkJob[];
}

const zeroHash = "0x0000000000000000000000000000000000000000000000000000000000000000";

function getAgentId(onchainAgentId: string) {
  const managedId = process.env.NEXT_PUBLIC_ARCTASK_MANAGED_AGENT_ID ?? "1";
  return onchainAgentId === managedId ? "agent-arctask-managed-worker" : `agent-onchain-${onchainAgentId}`;
}

function unixSecondsToIso(value: string) {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1_000).toISOString() : new Date(0).toISOString();
}

function deadlineToDateInput(value: number) {
  return Number.isFinite(value) && value > 0 ? new Date(value * 1_000).toISOString().slice(0, 10) : "";
}

function createNetworkState(
  agentsResponse: NetworkAgentsResponse,
  jobsResponse: NetworkJobsResponse,
  localState: ArcTaskState
): ArcTaskState {
  const localAgentsByOnchainId = new Map(
    localState.agents.filter((agent) => agent.onchainAgentId).map((agent) => [agent.onchainAgentId, agent])
  );
  const agents: Agent[] = (agentsResponse.agents ?? []).map((agent) => {
    const localAgent = localAgentsByOnchainId.get(agent.onchainAgentId);
    return {
      id: getAgentId(agent.onchainAgentId),
      onchainAgentId: agent.onchainAgentId,
      name: agent.name,
      description: agent.description,
      capabilities: agent.capabilities,
      ownerWallet: agent.ownerWallet,
      metadataUri: agent.metadataURI,
      reputation: agent.reputation,
      completedJobs: agent.completedJobs,
      rejectedJobs: agent.rejectedJobs,
      totalEarned: agent.totalEarned,
      createdAt: unixSecondsToIso(agent.createdAt),
      txHistory: localAgent?.txHistory ?? []
    };
  });
  const agentIdsByOnchainId = new Map(agents.map((agent) => [agent.onchainAgentId, agent.id]));
  const localJobsByOnchainId = new Map(
    localState.jobs.filter((job) => job.onchainJobId).map((job) => [job.onchainJobId, job])
  );
  const jobs: Job[] = (jobsResponse.jobs ?? []).map((job) => {
    const localJob = localJobsByOnchainId.get(job.onchainJobId);
    return {
      id: `job-onchain-${job.onchainJobId}`,
      onchainJobId: job.onchainJobId,
      title: job.title,
      description: job.description,
      agentId: agentIdsByOnchainId.get(job.onchainAgentId) ?? getAgentId(job.onchainAgentId),
      clientWallet: job.clientWallet,
      evaluatorWallet: job.evaluatorWallet,
      rewardAmount: Number(formatUnits(BigInt(job.rewardAmount), ARC_TESTNET.nativeCurrency.decimals)),
      deadline: deadlineToDateInput(job.deadline),
      status: job.status,
      deliverableHash: job.deliverableHash === zeroHash ? undefined : job.deliverableHash,
      createdAt: unixSecondsToIso(job.createdAt),
      updatedAt: unixSecondsToIso(job.updatedAt),
      txHistory: localJob?.txHistory ?? []
    };
  });

  return { agents, jobs };
}

export function useArcTaskState() {
  const [state, setState] = useState(seedState);

  useEffect(() => {
    const localState = getState();
    setState(localState);
    const unsubscribe = subscribeToState(() => setState(getState()));

    if (getArcMode() === "onchain") {
      void Promise.all([
        fetch("/api/network/agents?limit=100", { cache: "no-store" }),
        fetch("/api/network/jobs?limit=100", { cache: "no-store" })
      ])
        .then(async ([agentsResponse, jobsResponse]) => {
          const [agentsBody, jobsBody] = (await Promise.all([
            agentsResponse.json(),
            jobsResponse.json()
          ])) as [NetworkAgentsResponse, NetworkJobsResponse];
          if (!agentsResponse.ok || !jobsResponse.ok || !agentsBody.ok || !jobsBody.ok) {
            return;
          }

          hydrateNetworkState(createNetworkState(agentsBody, jobsBody, localState));
        })
        .catch(() => {
          // Keep the last confirmed local snapshot when Arc RPC is unavailable.
        });
    }

    return unsubscribe;
  }, []);

  return state;
}
