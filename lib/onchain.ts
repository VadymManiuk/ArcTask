"use client";

import {
  createPublicClient,
  createWalletClient,
  custom,
  formatUnits,
  http,
  keccak256,
  parseEventLogs,
  parseUnits,
  stringToHex
} from "viem";
import { arcTestnet } from "@/lib/arc-chain";
import {
  contractAddresses,
  escrowV2InitialJobId,
  escrowV3InitialJobId,
  escrowV4InitialJobId,
  getOnchainReadiness
} from "@/lib/arc-config";
import { getJobDeadlineSeconds } from "@/lib/job-deadline";
import { createExecutionPlan } from "@/lib/execution-routing.mjs";
import { getEthereumProvider, requestArcAccount } from "@/lib/wallet";
import registryAbi from "@/lib/contracts/abis/ERC8004AgentRegistry.json";
import escrowAbi from "@/lib/contracts/abis/ERC8183Escrow.json";
import escrowV2Abi from "@/lib/contracts/abis/ERC8183EscrowV2.json";
import type { Address, OnchainJobEventTx, TxAction } from "@/lib/types";

const publicClient = createPublicClient({
  chain: arcTestnet,
  transport: http(arcTestnet.rpcUrls.default.http[0])
});

type OnchainJob = readonly [
  Address,
  bigint,
  Address,
  Address,
  bigint,
  number,
  string,
  `0x${string}`,
  number,
  bigint,
  bigint
];

type OnchainEventName =
  | "JobCreated"
  | "DeliverableSubmitted"
  | "WorkAccepted"
  | "WorkRejected"
  | "JobRefunded"
  | "RetryFunded";

const agentRegisteredEventAbi = [
  {
    type: "event",
    name: "AgentRegistered",
    inputs: [
      { name: "agentId", type: "uint256", indexed: true },
      { name: "owner", type: "address", indexed: true },
      { name: "metadataURI", type: "string", indexed: false }
    ]
  }
] as const;

const jobCreatedEventAbi = [
  {
    type: "event",
    name: "JobCreated",
    inputs: [
      { name: "jobId", type: "uint256", indexed: true },
      { name: "agentId", type: "uint256", indexed: true },
      { name: "client", type: "address", indexed: true },
      { name: "evaluator", type: "address", indexed: false },
      { name: "rewardAmount", type: "uint256", indexed: false },
      { name: "deadline", type: "uint64", indexed: false },
      { name: "jobURI", type: "string", indexed: false }
    ]
  }
] as const;

const jobEventConfigs = [
  {
    eventName: "JobCreated",
    action: "JOB_FUNDED",
    label: "ERC-8183 style escrow funded with testnet USDC",
    method: "createJob(uint256,uint256,uint64,address,string)"
  },
  {
    eventName: "DeliverableSubmitted",
    action: "DELIVERABLE_SUBMITTED",
    label: "Deliverable hash submitted",
    method: "submitDeliverable(uint256,bytes32)"
  },
  {
    eventName: "WorkAccepted",
    action: "WORK_ACCEPTED",
    label: "Escrow settled to agent",
    method: "acceptWork(uint256)"
  },
  {
    eventName: "WorkRejected",
    action: "WORK_REJECTED",
    label: "Evaluator rejected deliverable",
    method: "rejectWork(uint256)"
  },
  {
    eventName: "JobRefunded",
    action: "JOB_REFUNDED",
    label: "Expired escrow refunded to client",
    method: "refundExpired(uint256)"
  }
] as const satisfies ReadonlyArray<{
  eventName: OnchainEventName;
  action: TxAction;
  label: string;
  method: string;
}>;

const retryFundedEventConfig = {
  eventName: "RetryFunded",
  action: "JOB_RETRY_FUNDED",
  label: "Revised execution funded",
  method: "fundRetry(uint256,uint256,uint64,string)"
} as const;

function getEventActor(eventName: OnchainEventName, args: Record<string, unknown>) {
  const candidate =
    eventName === "WorkAccepted"
      ? args.agentOwner
      : eventName === "DeliverableSubmitted" || eventName === "RetryFunded"
        ? undefined
        : args.client;

  return typeof candidate === "string" && /^0x[a-fA-F0-9]{40}$/.test(candidate) ? (candidate as Address) : undefined;
}

function getEventSummary(eventName: OnchainEventName, args: Record<string, unknown>) {
  if (typeof args.rewardAmount === "bigint") {
    const amount = `${formatUnits(args.rewardAmount, arcTestnet.nativeCurrency.decimals)} USDC`;
    if (eventName === "JobCreated") {
      return `${amount} locked for evaluator-controlled settlement.`;
    }

    if (eventName === "WorkAccepted") {
      return `${amount} released and agent reputation increased.`;
    }

    if (eventName === "JobRefunded") {
      return `${amount} returned to client after escrow closeout.`;
    }
  }

  if (eventName === "DeliverableSubmitted" && typeof args.deliverableHash === "string") {
    return `Keccak deliverable hash ${args.deliverableHash.slice(0, 10)}... recorded for evaluator review.`;
  }

  if (eventName === "WorkRejected") {
    return "Deliverable rejected and a negative reputation event recorded.";
  }

  if (eventName === "RetryFunded" && typeof args.rewardIncrease === "bigint") {
    return `${formatUnits(args.rewardIncrease, arcTestnet.nativeCurrency.decimals)} USDC added for a new isolated execution.`;
  }

  return undefined;
}

function getContractAddress(
  name:
    | "erc8004Registry"
    | "erc8183Escrow"
    | "erc8183EscrowV2"
    | "erc8183EscrowV3"
    | "erc8183EscrowV4"
) {
  const readiness = getOnchainReadiness();
  if (readiness.mode !== "onchain") {
    throw new Error("Onchain mode is not enabled.");
  }

  if (!readiness.isReady) {
    throw new Error("Onchain contract configuration is incomplete.");
  }

  const address = contractAddresses[name];
  if (!address || address === "native") {
    throw new Error(`Missing ${name} address.`);
  }

  return address as Address;
}

function getEscrowContext(onchainJobId?: string) {
  const jobId = onchainJobId === undefined ? null : BigInt(onchainJobId);
  const isV4 = jobId !== null && jobId >= escrowV4InitialJobId;
  const isV3 = isV4 || (jobId !== null && jobId >= escrowV3InitialJobId);
  const isV2 = isV3 || (jobId !== null && jobId >= escrowV2InitialJobId);
  const address = getContractAddress(
    isV4
      ? "erc8183EscrowV4"
      : isV3
        ? "erc8183EscrowV3"
        : isV2
          ? "erc8183EscrowV2"
          : "erc8183Escrow"
  );
  return {
    address,
    abi: isV2 ? escrowV2Abi : escrowAbi,
    isV2,
    isV3,
    isV4
  };
}

async function getConnectedWalletClient() {
  const account = await requestArcAccount();
  const walletClient = createWalletClient({
    account,
    chain: arcTestnet,
    transport: custom(getEthereumProvider())
  });

  return { account, walletClient };
}

function sameAddress(left: Address, right: Address) {
  return left.toLowerCase() === right.toLowerCase();
}

function assertConnectedWallet(account: Address, expected: Address, role: string) {
  if (!sameAddress(account, expected)) {
    throw new Error(`Wrong wallet for this action. Connected: ${account}. Switch to ${role}: ${expected}`);
  }
}

async function readOnchainJob(escrowAddress: Address, abi: typeof escrowAbi | typeof escrowV2Abi, onchainJobId: string) {
  return (await publicClient.readContract({
    address: escrowAddress,
    abi,
    functionName: "jobs",
    args: [BigInt(onchainJobId)]
  })) as OnchainJob;
}

function createJobPayloadUri(input: {
  title: string;
  description: string;
  agentId: string;
  onchainAgentId: string;
  clientWallet: Address;
  rewardAmount: number;
  deadline: string;
  evaluatorWallet: Address;
}) {
  const payload = {
    schema: "arctask.job.v1",
    title: input.title,
    description: input.description,
    localAgentId: input.agentId,
    onchainAgentId: input.onchainAgentId,
    clientWallet: input.clientWallet,
    rewardAmount: input.rewardAmount,
    deadline: input.deadline,
    evaluatorWallet: input.evaluatorWallet,
    executionEstimate: createExecutionPlan({
      title: input.title,
      description: input.description,
      rewardAmount: input.rewardAmount
    }),
    createdAt: new Date().toISOString()
  };

  return `data:application/json,${encodeURIComponent(JSON.stringify(payload))}`;
}

export async function getJobSnapshotOnchain(onchainJobId: string) {
  const escrow = getEscrowContext(onchainJobId);
  const job = await readOnchainJob(escrow.address, escrow.abi, onchainJobId);
  const execution = escrow.isV3
    ? ((await publicClient.readContract({
        address: escrow.address,
        abi: escrowV2Abi,
        functionName: "getJobExecution",
        args: [BigInt(onchainJobId)]
      })) as readonly [number, bigint, bigint])
    : null;

  return {
    clientWallet: job[0],
    onchainAgentId: job[1].toString(),
    agentOwnerWallet: job[2],
    evaluatorWallet: job[3],
    rewardAmount: job[4].toString(),
    deadline: Number(job[5]),
    jobPayloadUri: job[6],
    deliverableHash: job[7],
    status: job[8],
    createdAt: job[9].toString(),
    updatedAt: job[10].toString(),
    executionVersion: execution ? Number(execution[0]) : undefined,
    executionBudgetAmount: execution ? execution[1].toString() : undefined
  };
}

export async function getAgentReputationOnchain(onchainAgentId: string) {
  const registryAddress = getContractAddress("erc8004Registry");
  const result = (await publicClient.readContract({
    address: registryAddress,
    abi: registryAbi,
    functionName: "getAgentReputation",
    args: [BigInt(onchainAgentId)]
  })) as readonly [number, bigint, bigint, bigint];

  return {
    reputation: Number(result[0]),
    completedJobs: Number(result[1]),
    rejectedJobs: Number(result[2]),
    totalEarned: Number(formatUnits(result[3], arcTestnet.nativeCurrency.decimals))
  };
}

export async function getJobTxHistoryOnchain(onchainJobId: string): Promise<OnchainJobEventTx[]> {
  const escrow = getEscrowContext(onchainJobId);
  const jobId = BigInt(onchainJobId);
  const txs: OnchainJobEventTx[] = [];

  const eventConfigs = escrow.isV3
    ? [...jobEventConfigs, retryFundedEventConfig]
    : jobEventConfigs;
  for (const config of eventConfigs) {
    const events = await publicClient.getContractEvents({
      address: escrow.address,
      abi: escrow.abi,
      eventName: config.eventName,
      args: { jobId },
      fromBlock: BigInt(0),
      toBlock: "latest"
    });

    for (const event of events) {
      const args = ("args" in event ? event.args : {}) as Record<string, unknown>;
      txs.push({
        action: config.action,
        txHash: event.transactionHash,
        createdAt: new Date().toISOString(),
        label: config.label,
        contractLabel: "ERC-8183 Escrow",
        method: config.method,
        blockNumber: Number(event.blockNumber),
        actor: getEventActor(config.eventName, args),
        summary: getEventSummary(config.eventName, args)
      });
    }
  }

  return txs.sort((left, right) => (left.blockNumber ?? 0) - (right.blockNumber ?? 0));
}

async function waitForHash(hash: Address) {
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Error(`Transaction failed: ${hash}`);
  }

  return receipt;
}

export async function registerAgentOnchain(input: {
  ownerWallet: Address;
  metadataUri: string;
}) {
  const registryAddress = getContractAddress("erc8004Registry");
  const { account, walletClient } = await getConnectedWalletClient();
  assertConnectedWallet(account, input.ownerWallet, "agent owner wallet");
  const txHash = await walletClient.writeContract({
    address: registryAddress,
    abi: registryAbi,
    functionName: "registerAgent",
    args: [input.ownerWallet, input.metadataUri]
  });

  const receipt = await waitForHash(txHash);
  const registeredEvent = parseEventLogs({
    abi: agentRegisteredEventAbi,
    logs: receipt.logs,
    eventName: "AgentRegistered",
    strict: true
  }).find((event) => sameAddress(event.address, registryAddress));
  const agentId = registeredEvent?.args.agentId;
  if (typeof agentId !== "bigint") {
    throw new Error(`AgentRegistered event was not found in transaction receipt: ${txHash}`);
  }

  return {
    onchainAgentId: agentId.toString(),
    txHash,
    blockNumber: Number(receipt.blockNumber),
    gasUsed: receipt.gasUsed.toString()
  };
}

export async function createJobOnchain(input: {
  title: string;
  description: string;
  agentId: string;
  onchainAgentId: string;
  clientWallet: Address;
  rewardAmount: number;
  deadline: string;
  evaluatorWallet: Address;
}) {
  const escrowAddress = getContractAddress("erc8183EscrowV4");
  const { account, walletClient } = await getConnectedWalletClient();
  assertConnectedWallet(account, input.clientWallet, "client wallet");
  const rewardValue = parseUnits(input.rewardAmount.toString(), arcTestnet.nativeCurrency.decimals);
  const deadlineSeconds = getJobDeadlineSeconds(input.deadline);
  const jobPayloadUri = createJobPayloadUri(input);
  const fundingQuote = (await publicClient.readContract({
    address: escrowAddress,
    abi: escrowV2Abi,
    functionName: "quoteFunding",
    args: [rewardValue]
  })) as readonly [bigint, bigint, bigint, bigint, bigint];
  const txHash = await walletClient.writeContract({
    address: escrowAddress,
    abi: escrowV2Abi,
    functionName: "createJob",
    args: [BigInt(input.onchainAgentId), rewardValue, deadlineSeconds, input.evaluatorWallet, jobPayloadUri],
    value: fundingQuote[0]
  });

  const receipt = await waitForHash(txHash);
  const createdEvent = parseEventLogs({
    abi: jobCreatedEventAbi,
    logs: receipt.logs,
    eventName: "JobCreated",
    strict: true
  }).find((event) => sameAddress(event.address, escrowAddress));
  const jobId = createdEvent?.args.jobId;
  if (typeof jobId !== "bigint") {
    throw new Error(`JobCreated event was not found in transaction receipt: ${txHash}`);
  }

  return {
    onchainJobId: jobId.toString(),
    jobPayloadUri,
    txHash,
    blockNumber: Number(receipt.blockNumber),
    gasUsed: receipt.gasUsed.toString()
  };
}

export async function fundRetryOnchain(input: {
  onchainJobId: string;
  title: string;
  description: string;
  agentId: string;
  rewardIncrease: number;
  deadline: string;
}) {
  const escrow = getEscrowContext(input.onchainJobId);
  if (!escrow.isV4) {
    throw new Error("Funded retries are available only for safe V4 escrow jobs.");
  }
  if (!Number.isFinite(input.rewardIncrease) || input.rewardIncrease <= 0) {
    throw new Error("Retry funding must be greater than zero.");
  }

  const { account, walletClient } = await getConnectedWalletClient();
  const job = await readOnchainJob(escrow.address, escrow.abi, input.onchainJobId);
  assertConnectedWallet(account, job[0], "client wallet");
  const rewardIncrease = parseUnits(
    input.rewardIncrease.toString(),
    arcTestnet.nativeCurrency.decimals
  );
  const aggregateReward = Number(
    formatUnits(job[4] + rewardIncrease, arcTestnet.nativeCurrency.decimals)
  );
  const revisedJobURI = createJobPayloadUri({
    title: input.title,
    description: input.description,
    agentId: input.agentId,
    onchainAgentId: job[1].toString(),
    clientWallet: job[0],
    rewardAmount: aggregateReward,
    deadline: input.deadline,
    evaluatorWallet: job[3]
  });
  const fundingQuote = (await publicClient.readContract({
    address: escrow.address,
    abi: escrowV2Abi,
    functionName: "quoteFunding",
    args: [rewardIncrease]
  })) as readonly [bigint, bigint, bigint, bigint, bigint];
  const txHash = await walletClient.writeContract({
    address: escrow.address,
    abi: escrowV2Abi,
    functionName: "fundRetry",
    args: [
      BigInt(input.onchainJobId),
      rewardIncrease,
      getJobDeadlineSeconds(input.deadline),
      revisedJobURI
    ],
    value: fundingQuote[0]
  });
  const receipt = await waitForHash(txHash);
  return {
    jobPayloadUri: revisedJobURI,
    txHash,
    blockNumber: Number(receipt.blockNumber),
    gasUsed: receipt.gasUsed.toString()
  };
}

export async function submitDeliverableOnchain(input: {
  onchainJobId: string;
  deliverableContent: string;
}) {
  const escrow = getEscrowContext(input.onchainJobId);
  const { account, walletClient } = await getConnectedWalletClient();
  const job = await readOnchainJob(escrow.address, escrow.abi, input.onchainJobId);
  assertConnectedWallet(account, job[2], "agent owner wallet");
  const deliverableHash = keccak256(stringToHex(input.deliverableContent));
  const txHash = await walletClient.writeContract({
    address: escrow.address,
    abi: escrow.abi,
    functionName: "submitDeliverable",
    args: [BigInt(input.onchainJobId), deliverableHash]
  });

  const receipt = await waitForHash(txHash);
  return {
    deliverableHash,
    txHash,
    blockNumber: Number(receipt.blockNumber),
    gasUsed: receipt.gasUsed.toString()
  };
}

export async function acceptWorkOnchain(onchainJobId: string) {
  return settleJobOnchain("acceptWork", onchainJobId);
}

export async function rejectWorkOnchain(onchainJobId: string, reason: string) {
  const escrow = getEscrowContext(onchainJobId);
  if (!escrow.isV2) {
    return settleJobOnchain("rejectWork", onchainJobId);
  }

  const normalizedReason = reason.trim();
  if (!normalizedReason) {
    throw new Error("A concrete dispute reason is required.");
  }
  const { account, walletClient } = await getConnectedWalletClient();
  const job = await readOnchainJob(escrow.address, escrow.abi, onchainJobId);
  assertConnectedWallet(account, job[3], "evaluator wallet");
  const txHash = await walletClient.writeContract({
    address: escrow.address,
    abi: escrowV2Abi,
    functionName: "openDispute",
    args: [BigInt(onchainJobId), keccak256(stringToHex(normalizedReason))]
  });
  const receipt = await waitForHash(txHash);
  return { txHash, blockNumber: Number(receipt.blockNumber), gasUsed: receipt.gasUsed.toString() };
}

export async function refundExpiredOnchain(onchainJobId: string) {
  return settleJobOnchain("refundExpired", onchainJobId);
}

export async function requestRevisionOnchain(onchainJobId: string, reason: string) {
  const escrow = getEscrowContext(onchainJobId);
  if (!escrow.isV2) {
    throw new Error("Revision requests are available only for hybrid escrow jobs.");
  }
  const normalizedReason = reason.trim();
  if (!normalizedReason) {
    throw new Error("Explain what the agent must revise.");
  }
  const { account, walletClient } = await getConnectedWalletClient();
  const job = await readOnchainJob(escrow.address, escrow.abi, onchainJobId);
  assertConnectedWallet(account, job[3], "evaluator wallet");
  const txHash = await walletClient.writeContract({
    address: escrow.address,
    abi: escrowV2Abi,
    functionName: "requestRevision",
    args: [BigInt(onchainJobId), normalizedReason]
  });
  const receipt = await waitForHash(txHash);
  return { txHash, blockNumber: Number(receipt.blockNumber), gasUsed: receipt.gasUsed.toString() };
}

export async function finalizeReviewOnchain(onchainJobId: string) {
  const escrow = getEscrowContext(onchainJobId);
  if (!escrow.isV2) {
    throw new Error("Automatic review finalization is available only for hybrid escrow jobs.");
  }
  const { walletClient } = await getConnectedWalletClient();
  const txHash = await walletClient.writeContract({
    address: escrow.address,
    abi: escrowV2Abi,
    functionName: "finalizeReview",
    args: [BigInt(onchainJobId)]
  });
  const receipt = await waitForHash(txHash);
  return { txHash, blockNumber: Number(receipt.blockNumber), gasUsed: receipt.gasUsed.toString() };
}

export async function withdrawEscrowCreditOnchain(onchainJobId: string) {
  const escrow = getEscrowContext(onchainJobId);
  if (!escrow.isV2) {
    throw new Error("Pull-payment withdrawals are available only for hybrid escrow jobs.");
  }
  const { walletClient } = await getConnectedWalletClient();
  const txHash = await walletClient.writeContract({
    address: escrow.address,
    abi: escrowV2Abi,
    functionName: "withdraw"
  });
  const receipt = await waitForHash(txHash);
  return { txHash, blockNumber: Number(receipt.blockNumber), gasUsed: receipt.gasUsed.toString() };
}

async function settleJobOnchain(functionName: "acceptWork" | "rejectWork" | "refundExpired", onchainJobId: string) {
  const escrow = getEscrowContext(onchainJobId);
  const { account, walletClient } = await getConnectedWalletClient();
  const job = await readOnchainJob(escrow.address, escrow.abi, onchainJobId);
  if (functionName === "acceptWork" || functionName === "rejectWork") {
    assertConnectedWallet(account, job[3], "evaluator wallet");
  } else {
    assertConnectedWallet(account, job[0], "client wallet");
  }

  const txHash = await walletClient.writeContract({
    address: escrow.address,
    abi: escrow.abi,
    functionName,
    args: [BigInt(onchainJobId)]
  });

  const receipt = await waitForHash(txHash);
  return {
    txHash,
    blockNumber: Number(receipt.blockNumber),
    gasUsed: receipt.gasUsed.toString()
  };
}
