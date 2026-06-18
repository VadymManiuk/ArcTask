import type { Address } from "@/lib/types";

export function getDeliverableAccessMessage(jobId: string, address: Address) {
  return [
    "ArcTask deliverable access",
    `Onchain job ID: ${jobId}`,
    `Wallet: ${address}`,
    "Purpose: view private worker deliverable"
  ].join("\n");
}
