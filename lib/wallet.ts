"use client";

import { ARC_TESTNET } from "@/lib/arc";
import { getDeliverableAccessMessage } from "@/lib/deliverable-access";
import { normalizeAddress } from "@/lib/utils";
import type { Address } from "@/lib/types";

export type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

type WalletError = {
  code?: number | string;
  message?: string;
  data?: {
    code?: number | string;
    message?: string;
    originalError?: WalletError;
  };
  error?: WalletError;
};

export function getWalletErrorMessage(caught: unknown) {
  if (caught instanceof Error) {
    return caught.message;
  }

  if (caught && typeof caught === "object" && "message" in caught) {
    return String(caught.message);
  }

  return "Wallet connection failed.";
}

function getWalletErrorCode(caught: unknown): number | undefined {
  if (!caught || typeof caught !== "object") {
    return undefined;
  }

  const error = caught as WalletError;
  const directCode = error.code === undefined ? undefined : Number(error.code);
  if (Number.isFinite(directCode)) {
    return directCode;
  }

  const dataCode = error.data?.code === undefined ? undefined : Number(error.data.code);
  if (Number.isFinite(dataCode)) {
    return dataCode;
  }

  return getWalletErrorCode(error.data?.originalError ?? error.error);
}

function isUnrecognizedChainError(caught: unknown) {
  const code = getWalletErrorCode(caught);
  const message = getWalletErrorMessage(caught).toLowerCase();

  return (
    code === 4902 ||
    message.includes("unrecognized chain") ||
    message.includes("unknown chain") ||
    message.includes("not been added")
  );
}

export function getEthereumProvider() {
  const ethereum = (window as Window & { ethereum?: EthereumProvider }).ethereum;
  if (!ethereum) {
    throw new Error("Wallet not found.");
  }

  return ethereum;
}

async function requestSwitchToArcTestnet(ethereum: EthereumProvider, chainId: string) {
  await ethereum.request({
    method: "wallet_switchEthereumChain",
    params: [{ chainId }]
  });
}

async function requestAddArcTestnet(ethereum: EthereumProvider, chainId: string) {
  await ethereum.request({
    method: "wallet_addEthereumChain",
    params: [
      {
        chainId,
        chainName: ARC_TESTNET.chainName,
        nativeCurrency: ARC_TESTNET.nativeCurrency,
        rpcUrls: [ARC_TESTNET.rpcUrl],
        blockExplorerUrls: [ARC_TESTNET.explorerUrl]
      }
    ]
  });
}

export async function switchToArcTestnet(ethereum: EthereumProvider) {
  const chainId = `0x${ARC_TESTNET.chainId.toString(16)}`;

  try {
    await requestSwitchToArcTestnet(ethereum, chainId);
    return;
  } catch (caught) {
    if (!isUnrecognizedChainError(caught)) {
      throw caught;
    }
  }

  await requestAddArcTestnet(ethereum, chainId);
  await requestSwitchToArcTestnet(ethereum, chainId);
}

export function getFirstAccount(accounts: string[]) {
  const account = accounts[0];
  if (!account) {
    throw new Error("Wallet did not return an account.");
  }

  return normalizeAddress(account);
}

export async function requestArcAccount(): Promise<Address> {
  const ethereum = getEthereumProvider();
  await switchToArcTestnet(ethereum);
  const accounts = (await ethereum.request({ method: "eth_requestAccounts" })) as string[];
  return getFirstAccount(accounts);
}

export async function requestDeliverableAccessProof(jobId: string) {
  const ethereum = getEthereumProvider();
  const address = await requestArcAccount();
  const nonceResponse = await fetch(`/api/deliverables/${encodeURIComponent(jobId)}`, {
    method: "GET",
    cache: "no-store"
  });
  const nonceBody = (await nonceResponse.json().catch(() => ({}))) as {
    nonce?: string;
    issuedAt?: string;
  };
  if (!nonceResponse.ok || !nonceBody.nonce || !nonceBody.issuedAt) {
    throw new Error("Unable to start deliverable access challenge.");
  }

  const issuedAt = nonceBody.issuedAt;
  const message = getDeliverableAccessMessage(jobId, address, issuedAt, nonceBody.nonce);
  const signature = (await ethereum.request({
    method: "personal_sign",
    params: [message, address]
  })) as string;

  return { address, issuedAt, nonce: nonceBody.nonce, signature };
}
