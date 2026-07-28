"use client";

import { getOnchainReadiness } from "@/lib/arc-config";
export function TestnetStatus() {
  const readiness = getOnchainReadiness();
  const isMock = readiness.mode === "mock";
  const isReady = readiness.isReady;
  const label = isMock ? "Mock" : isReady ? "Testnet" : "Config missing";

  return (
    <span
      title={isReady ? label : `Missing: ${readiness.missing.join(", ") || "none"}. Invalid: ${readiness.invalid.join(", ") || "none"}.`}
      className="hidden h-10 items-center gap-2 rounded-xl border border-[#18324a] bg-[#0b1824] px-3 text-xs text-[#6fbbef] sm:inline-flex"
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${!isMock && isReady ? "bg-emerald-400" : "bg-amber-300"}`}
        aria-hidden="true"
      />
      {label}
    </span>
  );
}
