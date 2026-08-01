"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, RefreshCw, WalletCards } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ARC_TESTNET, getArcscanTxUrl } from "@/lib/arc";
import {
  getEscrowCreditBalancesOnchain,
  withdrawEscrowCreditVersionOnchain,
  type EscrowCreditBalance,
  type HybridEscrowVersion
} from "@/lib/onchain";
import { useWalletAccount } from "@/lib/use-wallet-account";
import { formatAddress } from "@/lib/utils";

export function EscrowCreditPanel() {
  const { address, error: walletError, isConnecting, connect } = useWalletAccount();
  const [balances, setBalances] = useState<EscrowCreditBalance[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [withdrawingVersion, setWithdrawingVersion] = useState<HybridEscrowVersion | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [txHash, setTxHash] = useState("");

  const loadBalances = useCallback(async () => {
    if (!address) {
      setBalances([]);
      return;
    }

    setIsLoading(true);
    setError("");
    try {
      setBalances(await getEscrowCreditBalancesOnchain(address as `0x${string}`));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to read escrow credits.");
    } finally {
      setIsLoading(false);
    }
  }, [address]);

  useEffect(() => {
    void loadBalances();
  }, [loadBalances]);

  const total = useMemo(
    () => balances.reduce((sum, balance) => sum + Number(balance.amountUsdc), 0),
    [balances]
  );

  async function withdraw(version: HybridEscrowVersion) {
    setWithdrawingVersion(version);
    setError("");
    setMessage("");
    setTxHash("");
    try {
      const result = await withdrawEscrowCreditVersionOnchain(version);
      setMessage(`${result.amountUsdc} USDC withdrawn from ${version.toUpperCase()} escrow.`);
      setTxHash(result.txHash);
      await loadBalances();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Withdrawal failed.");
      await loadBalances();
    } finally {
      setWithdrawingVersion(null);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Escrow credits</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Pull-payment balances available to the currently connected wallet.
          </p>
        </div>
        {address ? (
          <Button type="button" variant="outline" className="shrink-0" disabled={isLoading} onClick={() => void loadBalances()}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} aria-hidden="true" />
            Refresh
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-5">
        {!address ? (
          <div className="rounded-xl border border-[#1a2736] bg-[#070c13] p-5">
            <WalletCards className="h-6 w-6 text-[#42adff]" aria-hidden="true" />
            <p className="mt-3 font-semibold">Connect the payout wallet</p>
            <p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">
              ArcTask checks credits before asking for a transaction, so a wallet with a zero balance cannot send a failing withdrawal.
            </p>
            <Button className="mt-4" disabled={isConnecting} onClick={() => void connect().catch(() => undefined)}>
              {isConnecting ? "Connecting..." : "Connect wallet"}
            </Button>
          </div>
        ) : (
          <>
            <div className="flex flex-col justify-between gap-3 rounded-xl border border-[#1a2736] bg-[#070c13] p-4 sm:flex-row sm:items-center">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Connected wallet</p>
                <p className="mt-1 break-all font-semibold">{address}</p>
              </div>
              <div className="sm:text-right">
                <p className="text-xs text-muted-foreground">Total available</p>
                <p className="mt-1 text-xl font-semibold">{total.toFixed(4)} USDC</p>
              </div>
            </div>

            <div className="divide-y divide-white/[0.065] overflow-hidden rounded-xl border border-white/[0.065]">
              {balances.map((balance) => (
                <div key={balance.version} className="grid gap-3 bg-[#080c14] p-4 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold">{balance.label}</p>
                      <a
                        href={`${ARC_TESTNET.explorerUrl}/address/${balance.address}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                      >
                        {formatAddress(balance.address)}
                        <ExternalLink className="h-3 w-3" aria-hidden="true" />
                      </a>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {balance.amount === BigInt(0)
                        ? "No credit for this wallet"
                        : `${balance.amountUsdc} USDC ready to withdraw`}
                    </p>
                  </div>
                  <Button
                    type="button"
                    disabled={balance.amount === BigInt(0) || withdrawingVersion !== null}
                    onClick={() => void withdraw(balance.version)}
                  >
                    {withdrawingVersion === balance.version
                      ? "Withdrawing..."
                      : `Withdraw ${Number(balance.amountUsdc).toFixed(4)} USDC`}
                  </Button>
                </div>
              ))}
            </div>

            {!isLoading && balances.length > 0 && total === 0 ? (
              <p className="rounded-lg border border-amber-300/25 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
                This wallet has no withdrawable balance. If you expect a payout, switch to the wallet listed as the job’s agent owner, client, or evaluator.
              </p>
            ) : null}
          </>
        )}

        {walletError || error ? (
          <p className="rounded-lg border border-rose-300/25 bg-rose-300/10 px-4 py-3 text-sm font-medium text-rose-100">
            {error || walletError}
          </p>
        ) : null}
        {message ? (
          <p className="rounded-lg border border-emerald-300/25 bg-emerald-300/10 px-4 py-3 text-sm font-medium text-emerald-100">
            {message}{" "}
            {txHash ? (
              <a href={getArcscanTxUrl(txHash)} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                View transaction
              </a>
            ) : null}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
