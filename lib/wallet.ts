"use client";

import { ARC_MAINNET } from "@/lib/arc";
import { getDeliverableAccessMessage } from "@/lib/deliverable-access";
import { normalizeAddress } from "@/lib/utils";
import type { Address } from "@/lib/types";
import { getAuthorizedAccount } from "@/lib/wallet-account";

export { getAuthorizedAccount } from "@/lib/wallet-account";

export type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: "accountsChanged" | "disconnect", listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: "accountsChanged" | "disconnect", listener: (...args: unknown[]) => void) => void;
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
  const ethereum = getOptionalEthereumProvider();
  if (!ethereum) {
    throw new Error("Wallet not found.");
  }

  return ethereum;
}

export function getOptionalEthereumProvider() {
  if (typeof window === "undefined") {
    return undefined;
  }

  return (window as Window & { ethereum?: EthereumProvider }).ethereum;
}

async function requestSwitchToArcMainnet(ethereum: EthereumProvider, chainId: string) {
  await ethereum.request({
    method: "wallet_switchEthereumChain",
    params: [{ chainId }]
  });
}

async function requestAddArcMainnet(ethereum: EthereumProvider, chainId: string) {
  await ethereum.request({
    method: "wallet_addEthereumChain",
    params: [
      {
        chainId,
        chainName: ARC_MAINNET.chainName,
        nativeCurrency: ARC_MAINNET.nativeCurrency,
        rpcUrls: [ARC_MAINNET.rpcUrl],
        blockExplorerUrls: [ARC_MAINNET.explorerUrl]
      }
    ]
  });
}

export async function switchToArcMainnet(ethereum: EthereumProvider) {
  const chainId = `0x${ARC_MAINNET.chainId.toString(16)}`;

  try {
    await requestSwitchToArcMainnet(ethereum, chainId);
    return;
  } catch (caught) {
    if (!isUnrecognizedChainError(caught)) {
      throw caught;
    }
  }

  await requestAddArcMainnet(ethereum, chainId);
  await requestSwitchToArcMainnet(ethereum, chainId);
}

export function getFirstAccount(accounts: string[]) {
  const account = accounts[0];
  if (!account) {
    throw new Error("Wallet did not return an account.");
  }

  return normalizeAddress(account);
}

export async function restoreAuthorizedAccount(ethereum = getOptionalEthereumProvider()): Promise<Address | null> {
  if (!ethereum) {
    return null;
  }

  return getAuthorizedAccount(await ethereum.request({ method: "eth_accounts" }));
}

export async function requestArcAccount(): Promise<Address> {
  const ethereum = getEthereumProvider();
  await switchToArcMainnet(ethereum);
  const activeChainId = await ethereum.request({ method: "eth_chainId" });
  if (Number(activeChainId) !== ARC_MAINNET.chainId) throw new Error("Switch your wallet to Arc Mainnet (5042).");
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
