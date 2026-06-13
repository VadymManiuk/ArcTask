"use client";

import {
  createPublicClient,
  createWalletClient,
  custom,
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
import type { Address } from "@/lib/types";

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
  rewardAmount: number;
  deadline: string;
  evaluatorWallet: Address;
}) {
  const escrowAddress = getContractAddress("erc8183Escrow");
  const { walletClient } = await getConnectedWalletClient();
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
