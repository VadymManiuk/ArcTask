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
      className="hidden items-center gap-2 text-xs text-slate-500 md:inline-flex"
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${!isMock && isReady ? "bg-emerald-400" : "bg-amber-300"}`}
        aria-hidden="true"
      />
      {label}
    </span>
  );
}
