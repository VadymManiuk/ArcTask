"use client";

import { useState } from "react";
import { Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ARC_TESTNET } from "@/lib/arc";
import { formatAddress, normalizeAddress } from "@/lib/utils";

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
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

async function switchToArcTestnet(ethereum: EthereumProvider) {
  const chainId = `0x${ARC_TESTNET.chainId.toString(16)}`;

  try {
    await ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId }]
    });
  } catch (caught) {
    const errorCode = caught && typeof caught === "object" && "code" in caught ? Number(caught.code) : undefined;
    if (errorCode !== 4902) {
      throw caught;
    }

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
      setAddress(normalizeAddress(accounts[0] ?? ""));
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
