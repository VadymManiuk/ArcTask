import { ExternalLink } from "lucide-react";
import type { TxRecord } from "@/lib/types";
import { formatAddress } from "@/lib/utils";

export function TxList({ txs }: { txs: TxRecord[] }) {
  if (txs.length === 0) {
    return <p className="text-sm text-muted-foreground">No transaction activity yet.</p>;
  }

  return (
    <div className="space-y-3">
      {txs.map((tx) => (
        <a
          key={tx.id}
          href={tx.arcscanUrl}
          target="_blank"
          rel="noreferrer"
          className="flex min-w-0 items-center justify-between gap-4 rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm transition hover:border-cyan-300/40"
        >
          <span className="min-w-0">
            <span className="block break-words font-medium">{tx.label}</span>
            <span className="mt-1 block text-muted-foreground">{formatAddress(tx.txHash)}</span>
            <span className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
              {tx.contractLabel ? <span className="rounded bg-white/[0.06] px-2 py-0.5">{tx.contractLabel}</span> : null}
              {tx.method ? <span className="rounded bg-white/[0.06] px-2 py-0.5">{tx.method}</span> : null}
              {tx.blockNumber ? <span className="rounded bg-white/[0.06] px-2 py-0.5">Block {tx.blockNumber}</span> : null}
              {tx.gasUsed ? <span className="rounded bg-white/[0.06] px-2 py-0.5">{tx.gasUsed}</span> : null}
            </span>
            {tx.summary ? <span className="mt-2 block text-xs text-muted-foreground">{tx.summary}</span> : null}
          </span>
          <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </a>
      ))}
    </div>
  );
}
