import type { TxRecord } from "@/lib/types";
import { formatAddress } from "@/lib/utils";

export function TxList({ txs }: { txs: TxRecord[] }) {
  if (txs.length === 0) {
    return <p className="text-sm text-muted-foreground">No transaction activity yet.</p>;
  }

  return (
    <div className="divide-y divide-white/[0.065]">
      {txs.map((tx) => (
        <a
          key={tx.id}
          href={tx.arcscanUrl}
          target="_blank"
          rel="noreferrer"
          className="flex min-w-0 items-center justify-between gap-4 py-3 text-sm hover:text-white"
        >
          <span className="min-w-0">
            <span className="block break-words font-medium">{tx.label}</span>
            <span className="mt-1 block text-muted-foreground">{formatAddress(tx.txHash)}</span>
            {tx.method ? <span className="mt-1 block truncate text-xs text-slate-600">{tx.method}</span> : null}
          </span>
          <span className="shrink-0 text-slate-600">→</span>
        </a>
      ))}
    </div>
  );
}
