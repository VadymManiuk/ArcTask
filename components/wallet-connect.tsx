"use client";

import { useState } from "react";
import { Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatAddress } from "@/lib/utils";
import { getWalletErrorMessage, requestArcAccount } from "@/lib/wallet";

export function WalletConnect() {
  const [address, setAddress] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [isConnecting, setIsConnecting] = useState(false);

  async function connect() {
    setError("");
    setIsConnecting(true);

    try {
      setAddress(await requestArcAccount());
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
