export type Address = `0x${string}`;

export type JobStatus = "FUNDED" | "SUBMITTED" | "ACCEPTED" | "REJECTED" | "REFUNDED";

export type TxAction =
  | "AGENT_REGISTERED"
  | "JOB_FUNDED"
  | "DELIVERABLE_SUBMITTED"
  | "WORK_ACCEPTED"
  | "WORK_REJECTED"
  | "JOB_REFUNDED";

export interface TxRecord {
  id: string;
  action: TxAction;
  txHash: string;
  arcscanUrl: string;
  createdAt: string;
  label: string;
  contractLabel?: "ERC-8004 Registry" | "ERC-8183 Escrow" | "USDC";
  method?: string;
  blockNumber?: number;
  gasUsed?: string;
  actor?: Address;
  summary?: string;
}

export interface OnchainJobEventTx {
  action: TxAction;
  txHash: `0x${string}`;
  createdAt: string;
  label: string;
  contractLabel: TxRecord["contractLabel"];
  method: string;
  blockNumber?: number;
  actor?: Address;
  summary?: string;
}

export interface Agent {
  id: string;
  onchainAgentId?: string;
  name: string;
  description: string;
  capabilities: string[];
  ownerWallet: Address;
  metadataUri: string;
  reputation: number;
  completedJobs: number;
  rejectedJobs: number;
  totalEarned: number;
  createdAt: string;
  txHistory: TxRecord[];
}

export interface Job {
  id: string;
  onchainJobId?: string;
  jobPayloadUri?: string;
  title: string;
  description: string;
  agentId: string;
  clientWallet: Address;
  evaluatorWallet: Address;
  rewardAmount: number;
  deadline: string;
  status: JobStatus;
  deliverableContent?: string;
  deliverableHash?: string;
  createdAt: string;
  updatedAt: string;
  txHistory: TxRecord[];
}

export interface ArcTaskState {
  agents: Agent[];
  jobs: Job[];
}

export interface DashboardMetrics {
  totalAgents: number;
  totalJobs: number;
  totalEscrowed: number;
  totalCompletedJobs: number;
  totalReputationEvents: number;
  totalTxs: number;
}
