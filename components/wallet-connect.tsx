"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useWalletAccount } from "@/lib/use-wallet-account";
import { formatAddress } from "@/lib/utils";

export function WalletConnect() {
  const router = useRouter();
  const { address, error, isConnecting, connect } = useWalletAccount();

  async function handleWalletAction() {
    if (address) {
      router.push("/profile");
      return;
    }

    await connect().catch(() => undefined);
  }

  return (
    <div className="flex items-center gap-2">
      <Button type="button" variant="outline" onClick={handleWalletAction} disabled={isConnecting} className="h-9 px-3">
        {isConnecting ? "Connecting..." : address ? formatAddress(address) : "Connect"}
      </Button>
      {error ? <span className="hidden text-xs text-rose-300 sm:inline">{error}</span> : null}
    </div>
  );
}
