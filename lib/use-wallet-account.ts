"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getAuthorizedAccount,
  getOptionalEthereumProvider,
  getWalletErrorMessage,
  requestArcAccount,
  restoreAuthorizedAccount,
  type EthereumProvider
} from "@/lib/wallet";

export function useWalletAccount() {
  const [address, setAddress] = useState("");
  const [error, setError] = useState("");
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

  const connect = useCallback(async () => {
    setError("");
    setIsConnecting(true);

    try {
      const account = await requestArcAccount();
      setAddress(account);
      return account;
    } catch (caught) {
      const message = getWalletErrorMessage(caught);
      setError(message);
      throw caught;
    } finally {
      setIsConnecting(false);
    }
  }, []);

  return { address, error, isConnecting, connect };
}
