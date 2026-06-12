"use client";

import { useState } from "react";
import { Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ARC_TESTNET } from "@/lib/arc";
import { formatAddress, normalizeAddress } from "@/lib/utils";

type EthereumProvider = {
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

function getWalletErrorMessage(caught: unknown) {
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

async function switchToArcTestnet(ethereum: EthereumProvider) {
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

function getFirstAccount(accounts: string[]) {
  const account = accounts[0];
  if (!account) {
    throw new Error("Wallet did not return an account.");
  }

  return normalizeAddress(account);
}

export function WalletConnect() {
  const [address, setAddress] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [isConnecting, setIsConnecting] = useState(false);

  async function connect() {
    setError("");
    setIsConnecting(true);
    const ethereum = (window as Window & { ethereum?: EthereumProvider }).ethereum;
    if (!ethereum) {
      setError("Wallet not found");
      setIsConnecting(false);
      return;
    }

    try {
      await switchToArcTestnet(ethereum);
      const accounts = (await ethereum.request({ method: "eth_requestAccounts" })) as string[];
      setAddress(getFirstAccount(accounts));
    } catch (caught) {
      setError(getWalletErrorMessage(caught));
    } finally {
      setIsConnecting(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button type="button" variant="outline" onClick={connect} disabled={isConnecting} className="h-9 px-3">
        <Wallet className="h-4 w-4" aria-hidden="true" />
        {isConnecting ? "Connecting..." : address ? formatAddress(address) : "Connect"}
      </Button>
      {error ? <span className="hidden text-xs text-rose-700 sm:inline">{error}</span> : null}
    </div>
  );
}
