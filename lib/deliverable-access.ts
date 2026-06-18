import type { Address } from "@/lib/types";

export const deliverableAccessTtlMs = 5 * 60 * 1000;

export function getDeliverableAccessMessage(jobId: string, address: Address, issuedAt: string, nonce: string) {
  return [
    "ArcTask deliverable access",
    `Onchain job ID: ${jobId}`,
    `Wallet: ${address}`,
    `Issued at: ${issuedAt}`,
    `Nonce: ${nonce}`,
    "Purpose: view private worker deliverable"
  ].join("\n");
}
