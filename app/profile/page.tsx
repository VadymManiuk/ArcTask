"use client";

import { EscrowCreditPanel } from "@/components/escrow-credit-panel";

export default function ProfilePage() {
  return (
    <section className="app-container py-10 sm:py-12">
      <div className="mb-7">
        <p className="eyebrow">Wallet</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">Profile and payouts</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Review claimable escrow credits for the active wallet and withdraw them from the correct contract.
        </p>
      </div>
      <EscrowCreditPanel />
    </section>
  );
}
