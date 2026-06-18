"use client";

import {
  createPublicClient,
  createWalletClient,
  custom,
  formatUnits,
  http,
  keccak256,
  parseUnits,
  stringToHex
} from "viem";
import { arcTestnet } from "@/lib/arc-chain";
import { contractAddresses, getOnchainReadiness } from "@/lib/arc-config";
import { getEthereumProvider, requestArcAccount } from "@/lib/wallet";
import registryAbi from "@/lib/contracts/abis/ERC8004AgentRegistry.json";
import escrowAbi from "@/lib/contracts/abis/ERC8183Escrow.json";
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

type OnchainEventName = "JobCreated" | "DeliverableSubmitted" | "WorkAccepted" | "WorkRejected" | "JobRefunded";

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

function getEventActor(eventName: OnchainEventName, args: Record<string, unknown>) {
  const candidate =
    eventName === "WorkAccepted"
      ? args.agentOwner
      : eventName === "DeliverableSubmitted"
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

  return undefined;
}

function getContractAddress(name: "erc8004Registry" | "erc8183Escrow") {
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

async function readOnchainJob(escrowAddress: Address, onchainJobId: string) {
  return (await publicClient.readContract({
    address: escrowAddress,
    abi: escrowAbi,
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
    createdAt: new Date().toISOString()
  };

  return `data:application/json,${encodeURIComponent(JSON.stringify(payload))}`;
}

export async function getJobSnapshotOnchain(onchainJobId: string) {
  const escrowAddress = getContractAddress("erc8183Escrow");
  const job = await readOnchainJob(escrowAddress, onchainJobId);

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
    updatedAt: job[10].toString()
  };
}

export async function getJobTxHistoryOnchain(onchainJobId: string): Promise<OnchainJobEventTx[]> {
  const escrowAddress = getContractAddress("erc8183Escrow");
  const jobId = BigInt(onchainJobId);
  const txs: OnchainJobEventTx[] = [];

  for (const config of jobEventConfigs) {
    const events = await publicClient.getContractEvents({
      address: escrowAddress,
      abi: escrowAbi,
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
  const agentId = (await publicClient.readContract({
    address: registryAddress,
    abi: registryAbi,
    functionName: "nextAgentId"
  })) as bigint;
  const txHash = await walletClient.writeContract({
    address: registryAddress,
    abi: registryAbi,
    functionName: "registerAgent",
    args: [input.ownerWallet, input.metadataUri]
  });

  const receipt = await waitForHash(txHash);
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
  const escrowAddress = getContractAddress("erc8183Escrow");
  const { account, walletClient } = await getConnectedWalletClient();
  assertConnectedWallet(account, input.clientWallet, "client wallet");
  const jobId = (await publicClient.readContract({
    address: escrowAddress,
    abi: escrowAbi,
    functionName: "nextJobId"
  })) as bigint;
  const rewardValue = parseUnits(input.rewardAmount.toString(), arcTestnet.nativeCurrency.decimals);
  const deadlineSeconds = BigInt(Math.floor(Date.parse(`${input.deadline}T00:00:00Z`) / 1000));
  const jobPayloadUri = createJobPayloadUri(input);
  const txHash = await walletClient.writeContract({
    address: escrowAddress,
    abi: escrowAbi,
    functionName: "createJob",
    args: [BigInt(input.onchainAgentId), rewardValue, deadlineSeconds, input.evaluatorWallet, jobPayloadUri],
    value: rewardValue
  });

  const receipt = await waitForHash(txHash);
  return {
    onchainJobId: jobId.toString(),
    jobPayloadUri,
    txHash,
    blockNumber: Number(receipt.blockNumber),
    gasUsed: receipt.gasUsed.toString()
  };
}

export async function submitDeliverableOnchain(input: {
  onchainJobId: string;
  deliverableContent: string;
}) {
  const escrowAddress = getContractAddress("erc8183Escrow");
  const { account, walletClient } = await getConnectedWalletClient();
  const job = await readOnchainJob(escrowAddress, input.onchainJobId);
  assertConnectedWallet(account, job[2], "agent owner wallet");
  const deliverableHash = keccak256(stringToHex(input.deliverableContent));
  const txHash = await walletClient.writeContract({
    address: escrowAddress,
    abi: escrowAbi,
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

export async function rejectWorkOnchain(onchainJobId: string) {
  return settleJobOnchain("rejectWork", onchainJobId);
}

export async function refundExpiredOnchain(onchainJobId: string) {
  return settleJobOnchain("refundExpired", onchainJobId);
}

async function settleJobOnchain(functionName: "acceptWork" | "rejectWork" | "refundExpired", onchainJobId: string) {
  const escrowAddress = getContractAddress("erc8183Escrow");
  const { account, walletClient } = await getConnectedWalletClient();
  const job = await readOnchainJob(escrowAddress, onchainJobId);
  if (functionName === "acceptWork" || functionName === "rejectWork") {
    assertConnectedWallet(account, job[3], "evaluator wallet");
  } else {
    assertConnectedWallet(account, job[0], "client wallet");
  }

  const txHash = await walletClient.writeContract({
    address: escrowAddress,
    abi: escrowAbi,
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
