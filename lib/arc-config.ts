import { isAddressLike } from "@/lib/utils";

export type ArcMode = "mock" | "onchain";

const rawContractAddresses = {
  erc8004Registry: process.env.NEXT_PUBLIC_ERC8004_REGISTRY_ADDRESS,
  erc8183Escrow: process.env.NEXT_PUBLIC_ERC8183_ESCROW_ADDRESS,
  usdc: process.env.NEXT_PUBLIC_USDC_ADDRESS
};

export const contractAddresses = rawContractAddresses;

export function getArcMode(): ArcMode {
  return process.env.NEXT_PUBLIC_ARC_MODE === "onchain" ? "onchain" : "mock";
}

export function getOnchainReadiness() {
  const missing = Object.entries(rawContractAddresses)
    .filter(([, value]) => !value)
    .map(([key]) => key);
  const invalid = Object.entries(rawContractAddresses)
    .filter(([key, value]) => value && !(key === "usdc" && value === "native") && !isAddressLike(value))
    .map(([key]) => key);

  return {
    mode: getArcMode(),
    isReady: missing.length === 0 && invalid.length === 0,
    missing,
    invalid
  };
}
