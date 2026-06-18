import { getArcscanTxUrl } from "@/lib/arc";
import type { Agent, ArcTaskState, Job, TxRecord } from "@/lib/types";

function seedTx(
  id: string,
  label: string,
  action: TxRecord["action"],
  txHash: string,
  method: string,
  contractLabel: TxRecord["contractLabel"],
  summary: string
): TxRecord {
  return {
    id,
    action,
    txHash,
    arcscanUrl: getArcscanTxUrl(txHash),
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    label,
    method,
    contractLabel,
    blockNumber: 5_071_420,
    gasUsed: "42,810 gas",
    summary
  };
}

const agentRegisterTx = seedTx(
  "tx_seed_agent_1",
  "Agent identity registered",
  "AGENT_REGISTERED",
  "0x8f4b0c8f23b4ab35aa9a06fe0d1c0dfc2600ec57d84f8834704bb2d7799a1001",
  "registerAgent(address,string)",
  "ERC-8004 Registry",
  "SpecVerifier AI metadata anchored for public agent discovery."
);

const jobFundedTx = seedTx(
  "tx_seed_job_1",
  "Escrow funded with testnet USDC",
  "JOB_FUNDED",
  "0x3d1bb9f47b6f710773d8a15b4b8f1ef7c6ab1496d5e6d74b0ec587efb71002ad",
  "createJob(uint256,uint256,uint64,address,string)",
  "ERC-8183 Escrow",
  "240 USDC locked for evaluator-controlled settlement."
);

const acceptedTx = seedTx(
  "tx_seed_job_2",
  "Evaluator accepted deliverable",
  "WORK_ACCEPTED",
  "0x3ce9c7d6e5c7dd21b7e84d7ef8fdc3c3a1fb8ac93076bb1e65acd477ba710a2d",
  "acceptWork(uint256)",
  "ERC-8183 Escrow",
  "Reward released and positive reputation event emitted."
);

export const managedArcTaskAgent: Agent = {
  id: "agent-arctask-managed-worker",
  onchainAgentId: "7",
  name: "ArcTask Managed Worker",
  description:
    "Public autonomous worker for ArcTask demo jobs. It watches Arc Testnet, generates evaluator-ready reports, and submits deliverable hashes onchain.",
  capabilities: ["autonomous reports", "Arc Testnet jobs", "escrow deliverables", "OpenAI execution"],
  ownerWallet: "0x7B42ED8165710a86684a54E8B02ec0f61Da8C897",
  metadataUri: "data:application/json,%7B%22name%22%3A%22ArcTask%20Managed%20Worker%22%2C%22capabilities%22%3A%5B%22autonomous%20reports%22%2C%22Arc%20Testnet%20jobs%22%2C%22escrow%20deliverables%22%5D%7D",
  reputation: 96,
  completedJobs: 5,
  rejectedJobs: 0,
  totalEarned: 5.1,
  createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
  txHistory: [
    seedTx(
      "tx_seed_managed_agent",
      "Managed worker identity registered",
      "AGENT_REGISTERED",
      "0x02570dbf678db046734d5513182ccc45545058a7e90311be36b2cc315abc95fd",
      "registerAgent(address,string)",
      "ERC-8004 Registry",
      "ArcTask Managed Worker registered for public demo jobs."
    )
  ]
};

export const seedAgents: Agent[] = [
  managedArcTaskAgent,
  {
    id: "agent-verifier-001",
    name: "SpecVerifier AI",
    description: "Checks technical submissions against acceptance criteria and produces audit-grade review notes.",
    capabilities: ["spec review", "code QA", "risk scoring"],
    ownerWallet: "0x9a41C3F5D35D8B5A0f30d9eA9273b28f4c1E3351",
    metadataUri: "ipfs://bafybeiarctask-specverifier",
    reputation: 88,
    completedJobs: 6,
    rejectedJobs: 1,
    totalEarned: 1280,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 12).toISOString(),
    txHistory: [agentRegisterTx]
  },
  {
    id: "agent-builder-002",
    name: "DataForge Agent",
    description: "Transforms messy datasets into normalized JSON, CSV, and typed API-ready payloads.",
    capabilities: ["data cleanup", "schema mapping", "ETL"],
    ownerWallet: "0x34B4f3F1D22f2A8c90C74631A5c4A7bE440F2230",
    metadataUri: "ipfs://bafybeiarctask-dataforge",
    reputation: 74,
    completedJobs: 4,
    rejectedJobs: 0,
    totalEarned: 915,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 8).toISOString(),
    txHistory: [
      seedTx(
        "tx_seed_agent_2",
        "Agent identity registered",
        "AGENT_REGISTERED",
        "0x8ba2e448a0b744f580b51aaed9de141389b95d5c11143221a7dd581c872149f0",
        "registerAgent(address,string)",
        "ERC-8004 Registry",
        "DataForge Agent registered with metadata and owner wallet."
      )
    ]
  },
  {
    id: "agent-research-003",
    name: "SignalScout",
    description: "Research agent for market maps, source synthesis, and concise decision memos.",
    capabilities: ["research", "summarization", "source tracing"],
    ownerWallet: "0x7cA9B099cB5cE521dFcD9bBa4B528bC155e0c880",
    metadataUri: "ipfs://bafybeiarctask-signalscout",
    reputation: 69,
    completedJobs: 3,
    rejectedJobs: 1,
    totalEarned: 640,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5).toISOString(),
    txHistory: [
      seedTx(
        "tx_seed_agent_3",
        "Agent identity registered",
        "AGENT_REGISTERED",
        "0x81ddfa46b4a17719bde62c003e1af943b95750b3cf54f71272a5c375c2a9132f",
        "registerAgent(address,string)",
        "ERC-8004 Registry",
        "SignalScout registered as a research-capable AI agent."
      )
    ]
  }
];

export const seedJobs: Job[] = [
  {
    id: "job-escrow-001",
    title: "Review Arc escrow settlement spec",
    description: "Validate acceptance criteria, edge cases, and evaluator settlement flow for the demo contract interface.",
    agentId: "agent-verifier-001",
    clientWallet: "0x44A155a5cDe7E255Df65A7426a8171E2F0B85A11",
    evaluatorWallet: "0xD2cc9E26fC01764006cD1d98Bb3dC9Ad42dC6201",
    rewardAmount: 240,
    deadline: new Date(Date.now() + 1000 * 60 * 60 * 24 * 4).toISOString().slice(0, 10),
    status: "ACCEPTED",
    deliverableContent: "Audit notes delivered with settlement edge cases and recommended event fields.",
    deliverableHash: "0x4b694ac8b4e391652992b22d34fb9b1288aac7bba4ec59c92e41804af716db31",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3).toISOString(),
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 16).toISOString(),
    txHistory: [jobFundedTx, acceptedTx]
  },
  {
    id: "job-data-002",
    title: "Normalize agent marketplace metadata",
    description: "Convert sample agent listings into a canonical schema with capability tags and scoring fields.",
    agentId: "agent-builder-002",
    clientWallet: "0x44A155a5cDe7E255Df65A7426a8171E2F0B85A11",
    evaluatorWallet: "0xD2cc9E26fC01764006cD1d98Bb3dC9Ad42dC6201",
    rewardAmount: 180,
    deadline: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString().slice(0, 10),
    status: "FUNDED",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 10).toISOString(),
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 10).toISOString(),
    txHistory: [
      seedTx(
        "tx_seed_job_3",
        "Escrow funded with testnet USDC",
        "JOB_FUNDED",
        "0x70cc7f1e062e643906bd527d96c2de4f7dc9e28d6f8ef9b46e1239d1cd283030",
        "createJob(uint256,uint256,uint64,address,string)",
        "ERC-8183 Escrow",
        "180 USDC escrow opened for metadata normalization."
      )
    ]
  }
];

export const seedState: ArcTaskState = {
  agents: seedAgents,
  jobs: seedJobs
};
