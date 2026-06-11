"use client";

import { useState } from "react";
import { Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatAddress } from "@/lib/utils";

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

export function WalletConnect() {
  const [address, setAddress] = useState<string>("");
  const [error, setError] = useState<string>("");

  async function connect() {
    setError("");
    const ethereum = (window as Window & { ethereum?: EthereumProvider }).ethereum;
    if (!ethereum) {
      setError("Wallet not found");
      return;
    }

    const accounts = (await ethereum.request({ method: "eth_requestAccounts" })) as string[];
    setAddress(accounts[0] ?? "");
  }

  return (
    <div className="flex items-center gap-2">
      <Button type="button" variant="outline" onClick={connect} className="h-9 px-3">
        <Wallet className="h-4 w-4" aria-hidden="true" />
        {address ? formatAddress(address) : "Connect"}
      </Button>
      {error ? <span className="hidden text-xs text-rose-700 sm:inline">{error}</span> : null}
    </div>
  );
}
