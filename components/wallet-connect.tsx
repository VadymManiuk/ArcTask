"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { formatAddress } from "@/lib/utils";
import {
  getAuthorizedAccount,
  getOptionalEthereumProvider,
  getWalletErrorMessage,
  requestArcAccount,
  restoreAuthorizedAccount,
  type EthereumProvider
} from "@/lib/wallet";

export function WalletConnect() {
  const [address, setAddress] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [isConnecting, setIsConnecting] = useState(false);

  useEffect(() => {
    let active = true;
    let attachedProvider: EthereumProvider | undefined;

    const handleAccountsChanged = (...args: unknown[]) => {
      if (!active) {
        return;
      }

      setAddress(getAuthorizedAccount(args[0]) ?? "");
      setError("");
    };
    const handleDisconnect = () => {
      if (active) {
        setAddress("");
      }
    };
    const attachAndRestore = async () => {
      const provider = getOptionalEthereumProvider();
      if (!provider) {
        return;
      }

      if (attachedProvider !== provider) {
        attachedProvider?.removeListener?.("accountsChanged", handleAccountsChanged);
        attachedProvider?.removeListener?.("disconnect", handleDisconnect);
        attachedProvider = provider;
        provider.on?.("accountsChanged", handleAccountsChanged);
        provider.on?.("disconnect", handleDisconnect);
      }

      try {
        const authorizedAccount = await restoreAuthorizedAccount(provider);
        if (active) {
          setAddress(authorizedAccount ?? "");
        }
      } catch {
        // A locked wallet may reject silent reads. Keep the explicit Connect action available.
      }
    };

    void attachAndRestore();
    const delayedProviderCheck = window.setTimeout(() => void attachAndRestore(), 1_000);
    window.addEventListener("ethereum#initialized", attachAndRestore);

    return () => {
      active = false;
      window.clearTimeout(delayedProviderCheck);
      window.removeEventListener("ethereum#initialized", attachAndRestore);
      attachedProvider?.removeListener?.("accountsChanged", handleAccountsChanged);
      attachedProvider?.removeListener?.("disconnect", handleDisconnect);
    };
  }, []);

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
        {isConnecting ? "Connecting..." : address ? formatAddress(address) : "Connect"}
      </Button>
      {error ? <span className="hidden text-xs text-rose-300 sm:inline">{error}</span> : null}
    </div>
  );
}
